 
import { describe, it, expect, beforeEach } from "vitest";

interface MockContract {
	admin: string;
	paused: boolean;
	totalSupply: bigint;
	balances: Map<string, bigint>;
	stakedBalances: Map<string, bigint>;
	allowances: Map<string, bigint>; // Key as `${owner}_${spender}`
	stakingTimestamps: Map<string, bigint>;
	MAX_SUPPLY: bigint;
	blockHeight: bigint; // Simulated block height

	isAdmin(caller: string): boolean;
	setPaused(
		caller: string,
		pause: boolean
	): { value: boolean } | { error: number };
	mint(
		caller: string,
		recipient: string,
		amount: bigint
	): { value: boolean } | { error: number };
	burn(caller: string, amount: bigint): { value: boolean } | { error: number };
	transfer(
		caller: string,
		recipient: string,
		amount: bigint
	): { value: boolean } | { error: number };
	approve(
		caller: string,
		spender: string,
		amount: bigint
	): { value: boolean } | { error: number };
	transferFrom(
		caller: string,
		owner: string,
		recipient: string,
		amount: bigint
	): { value: boolean } | { error: number };
	stake(caller: string, amount: bigint): { value: boolean } | { error: number };
	unstake(
		caller: string,
		amount: bigint
	): { value: boolean } | { error: number };
	getBalance(account: string): bigint;
	getStakedBalance(account: string): bigint;
	getAllowance(owner: string, spender: string): bigint;
}

const mockContract: MockContract = {
	admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
	paused: false,
	totalSupply: 0n,
	balances: new Map<string, bigint>(),
	stakedBalances: new Map<string, bigint>(),
	allowances: new Map<string, bigint>(),
	stakingTimestamps: new Map<string, bigint>(),
	MAX_SUPPLY: 100_000_000_000_000n,
	blockHeight: 100n, // Initial simulated height

	isAdmin(caller: string) {
		return caller === this.admin;
	},

	setPaused(caller: string, pause: boolean) {
		if (!this.isAdmin(caller)) return { error: 100 };
		this.paused = pause;
		return { value: pause };
	},

	mint(caller: string, recipient: string, amount: bigint) {
		if (!this.isAdmin(caller)) return { error: 100 };
		if (amount <= 0n) return { error: 106 };
		if (this.totalSupply + amount > this.MAX_SUPPLY) return { error: 103 };
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		this.totalSupply += amount;
		return { value: true };
	},

	burn(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		this.balances.set(caller, bal - amount);
		this.totalSupply -= amount;
		return { value: true };
	},

	transfer(caller: string, recipient: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		this.balances.set(caller, bal - amount);
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		return { value: true };
	},

	approve(caller: string, spender: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		this.allowances.set(`${caller}_${spender}`, amount);
		return { value: true };
	},

	transferFrom(
		caller: string,
		owner: string,
		recipient: string,
		amount: bigint
	) {
		if (this.paused) return { error: 104 };
		const allowance = this.allowances.get(`${owner}_${caller}`) ?? 0n;
		if (allowance < amount) return { error: 107 };
		const ownerBal = this.balances.get(owner) ?? 0n;
		if (ownerBal < amount) return { error: 101 };
		this.balances.set(owner, ownerBal - amount);
		this.balances.set(recipient, (this.balances.get(recipient) ?? 0n) + amount);
		this.allowances.set(`${owner}_${caller}`, allowance - amount);
		return { value: true };
	},

	stake(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const bal = this.balances.get(caller) ?? 0n;
		if (bal < amount) return { error: 101 };
		this.balances.set(caller, bal - amount);
		this.stakedBalances.set(
			caller,
			(this.stakedBalances.get(caller) ?? 0n) + amount
		);
		this.stakingTimestamps.set(caller, this.blockHeight);
		return { value: true };
	},

	unstake(caller: string, amount: bigint) {
		if (this.paused) return { error: 104 };
		if (amount <= 0n) return { error: 106 };
		const stakeBal = this.stakedBalances.get(caller) ?? 0n;
		if (stakeBal < amount) return { error: 102 };
		const stakeTime = this.stakingTimestamps.get(caller) ?? 0n;
		if (this.blockHeight - stakeTime < 10n) return { error: 109 };
		this.stakedBalances.set(caller, stakeBal - amount);
		this.balances.set(caller, (this.balances.get(caller) ?? 0n) + amount);
		return { value: true };
	},

	getBalance(account: string): bigint {
		return this.balances.get(account) ?? 0n;
	},

	getStakedBalance(account: string): bigint {
		return this.stakedBalances.get(account) ?? 0n;
	},

	getAllowance(owner: string, spender: string): bigint {
		return this.allowances.get(`${owner}_${spender}`) ?? 0n;
	},
};

describe("IndieStream Creator Token Contract", () => {
	beforeEach(() => {
		mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
		mockContract.paused = false;
		mockContract.totalSupply = 0n;
		mockContract.balances = new Map();
		mockContract.stakedBalances = new Map();
		mockContract.allowances = new Map();
		mockContract.stakingTimestamps = new Map();
		mockContract.blockHeight = 100n;
	});

	it("should allow admin to mint tokens", () => {
		const result = mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			1000n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(1000n);
		expect(mockContract.totalSupply).toBe(1000n);
	});

	it("should prevent non-admin from minting", () => {
		const result = mockContract.mint(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			1000n
		);
		expect(result).toEqual({ error: 100 });
	});

	it("should prevent minting over max supply", () => {
		const result = mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			200_000_000_000_000n
		);
		expect(result).toEqual({ error: 103 });
	});

	it("should allow burning tokens", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		const result = mockContract.burn(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			200n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(300n);
		expect(mockContract.totalSupply).toBe(300n);
	});

	it("should prevent burning more than balance", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		const result = mockContract.burn(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			600n
		);
		expect(result).toEqual({ error: 101 });
	});

	it("should allow transfers", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		const result = mockContract.transfer(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			200n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(300n);
		expect(
			mockContract.getBalance("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP")
		).toBe(200n);
	});

	it("should prevent transfers when paused", () => {
		mockContract.setPaused(mockContract.admin, true);
		const result = mockContract.transfer(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			10n
		);
		expect(result).toEqual({ error: 104 });
	});

	it("should allow approving allowances", () => {
		const result = mockContract.approve(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			300n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getAllowance(
				"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
				"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP"
			)
		).toBe(300n);
	});

	it("should allow transfer-from with allowance", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		mockContract.approve(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST4V5P0WQX4K3M2MFTM2G2G3HKHSDGNV5N7R21XD",
			200n
		);
		const result = mockContract.transferFrom(
			"ST4V5P0WQX4K3M2MFTM2G2G3HKHSDGNV5N7R21XD",
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			100n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(400n);
		expect(
			mockContract.getBalance("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP")
		).toBe(100n);
		expect(
			mockContract.getAllowance(
				"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
				"ST4V5P0WQX4K3M2MFTM2G2G3HKHSDGNV5N7R21XD"
			)
		).toBe(100n);
	});

	it("should prevent transfer-from exceeding allowance", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		mockContract.approve(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST4V5P0WQX4K3M2MFTM2G2G3HKHSDGNV5N7R21XD",
			100n
		);
		const result = mockContract.transferFrom(
			"ST4V5P0WQX4K3M2MFTM2G2G3HKHSDGNV5N7R21XD",
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			"ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
			200n
		);
		expect(result).toEqual({ error: 107 });
	});

	it("should allow staking tokens", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		const result = mockContract.stake(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			200n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(300n);
		expect(
			mockContract.getStakedBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(200n);
	});

	it("should allow unstaking after lock period", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		mockContract.stake("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2", 200n);
		mockContract.blockHeight += 10n; // Advance time
		const result = mockContract.unstake(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			100n
		);
		expect(result).toEqual({ value: true });
		expect(
			mockContract.getStakedBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(100n);
		expect(
			mockContract.getBalance("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2")
		).toBe(400n);
	});

	it("should prevent unstaking during lock period", () => {
		mockContract.mint(
			mockContract.admin,
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			500n
		);
		mockContract.stake("ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2", 200n);
		const result = mockContract.unstake(
			"ST2CY5V39NHDP5P0TP2KS8AMGE0Z8DVJR4VPD9BF2",
			100n
		);
		expect(result).toEqual({ error: 109 });
	});
});