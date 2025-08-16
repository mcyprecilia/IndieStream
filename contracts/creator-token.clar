 
;; IndieStream Creator Token Contract
;; Clarity v2 (assuming latest syntax with traits where applicable)
;; Implements SIP-10 compliant fungible token for creators, with minting, burning, transferring,
;; staking for rewards and governance power, admin controls, pausing, allowances, and metadata.
;; This contract is designed to be deployed per creator or as a multi-creator system, but here
;; implemented as a single token template with creator-specific extensions.
;; Expanded for robustness: includes allowances (approve/spend), batch operations, events via print,
;; and basic staking with accrual simulation.

(define-trait ft-trait
  (
    (transfer (principal principal uint (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
    (get-total-supply () (response uint uint))
    (get-name () (response (string-ascii 32) uint))
    (get-symbol () (response (string-ascii 32) uint))
    (get-decimals () (response uint uint))
    (get-token-uri () (response (optional (string-utf8 256)) uint))
  )
)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INSUFFICIENT-STAKE u102)
(define-constant ERR-MAX-SUPPLY-REACHED u103)
(define-constant ERR-PAUSED u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-INVALID-AMOUNT u106)
(define-constant ERR-ALLOWANCE-EXCEEDED u107)
(define-constant ERR-NOT-APPROVED u108)
(define-constant ERR-STAKING-LOCKED u109) ;; For future lock periods if added

;; Token metadata
(define-constant TOKEN-NAME "IndieStream Creator Token")
(define-constant TOKEN-SYMBOL "ISCT")
(define-constant TOKEN-DECIMALS u6)
(define-constant MAX-SUPPLY u100000000000000) ;; 100M tokens with decimals
(define-data-var token-uri (optional (string-utf8 256)) none)

;; Admin and contract state
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint u0)

;; Balances, stakes, and allowances
(define-map balances principal uint)
(define-map staked-balances principal uint)
(define-map allowances {owner: principal, spender: principal} uint)
(define-map staking-timestamps principal uint) ;; Last stake time for reward calc

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: emit event via print
(define-private (emit-event (event-type (string-ascii 32)) (data (tuple (key (string-ascii 32)) (value (string-ascii 64)))))
  (print {type: event-type, data: data})
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin tx-sender)) (err ERR-ZERO-ADDRESS)) ;; Prevent self-lockout example
    (var-set admin new-admin)
    (emit-event "admin-transfer" (tuple (key "new-admin") (value (principal-to-string new-admin))))
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (emit-event "pause-status" (tuple (key "paused") (value (bool-to-string pause))))
    (ok pause)
  )
)

;; Update token URI (for metadata)
(define-public (set-token-uri (new-uri (string-utf8 256)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set token-uri (some new-uri))
    (ok true)
  )
)

;; Mint new tokens (admin only)
(define-public (mint (recipient principal) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-ZERO-ADDRESS)) ;; Example check
    (let ((new-supply (+ (var-get total-supply) amount)))
      (asserts! (<= new-supply MAX-SUPPLY) (err ERR-MAX-SUPPLY-REACHED))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (var-set total-supply new-supply)
      (emit-event "mint" (tuple (key "recipient") (value (principal-to-string recipient))))
      (ok true)
    )
  )
)

;; Burn tokens (from caller's balance)
(define-public (burn (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (var-set total-supply (- (var-get total-supply) amount))
      (emit-event "burn" (tuple (key "amount") (value (uint-to-string amount))))
      (ok true)
    )
  )
)

;; SIP-10 transfer
(define-public (transfer (recipient principal) (amount uint) (memo (optional (buff 34))))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq recipient tx-sender)) (err ERR-ZERO-ADDRESS))
    (let ((sender-balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= sender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- sender-balance amount))
      (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
      (emit-event "transfer" (tuple (key "from") (value (principal-to-string tx-sender))))
      (ok true)
    )
  )
)

;; Approve allowance
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (map-set allowances {owner: tx-sender, spender: spender} amount)
    (emit-event "approve" (tuple (key "spender") (value (principal-to-string spender))))
    (ok true)
  )
)

;; Transfer from (using allowance)
(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (begin
    (ensure-not-paused)
    (let ((allowance (default-to u0 (map-get? allowances {owner: owner, spender: tx-sender}))))
      (asserts! (>= allowance amount) (err ERR-ALLOWANCE-EXCEEDED))
      (let ((owner-balance (default-to u0 (map-get? balances owner))))
        (asserts! (>= owner-balance amount) (err ERR-INSUFFICIENT-BALANCE))
        (map-set balances owner (- owner-balance amount))
        (map-set balances recipient (+ amount (default-to u0 (map-get? balances recipient))))
        (map-set allowances {owner: owner, spender: tx-sender} (- allowance amount))
        (emit-event "transfer-from" (tuple (key "owner") (value (principal-to-string owner))))
        (ok true)
      )
    )
  )
)

;; Stake tokens for governance/rewards
(define-public (stake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (map-set balances tx-sender (- balance amount))
      (map-set staked-balances tx-sender (+ amount (default-to u0 (map-get? staked-balances tx-sender))))
      (map-set staking-timestamps tx-sender block-height) ;; For future reward accrual
      (emit-event "stake" (tuple (key "amount") (value (uint-to-string amount))))
      (ok true)
    )
  )
)

;; Unstake tokens
(define-public (unstake (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (let ((stake-balance (default-to u0 (map-get? staked-balances tx-sender))))
      (asserts! (>= stake-balance amount) (err ERR-INSUFFICIENT-STAKE))
      ;; Simulate check for lock period (expandable)
      (asserts! (> (- block-height (default-to u0 (map-get? staking-timestamps tx-sender))) u10) (err ERR-STAKING-LOCKED))
      (map-set staked-balances tx-sender (- stake-balance amount))
      (map-set balances tx-sender (+ amount (default-to u0 (map-get? balances tx-sender))))
      (emit-event "unstake" (tuple (key "amount") (value (uint-to-string amount))))
      (ok true)
    )
  )
)

;; Batch transfer (for efficiency)
(define-public (batch-transfer (recipients (list 10 (tuple (to principal) (amt uint)))))
  (fold batch-transfer-iter recipients (ok u0))
)

(define-private (batch-transfer-iter (entry (tuple (to principal) (amt uint))) (prev (response uint uint)))
  (match prev
    success (let ((total success))
      (match (transfer (get to entry) (get amt entry) none)
        ok-val (+ total (get amt entry))
        err-val (err err-val)
      )
    )
    error error
  )
)

;; Read-only: get balance (SIP-10)
(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? balances account)))
)

;; Read-only: get staked balance
(define-read-only (get-staked-balance (account principal))
  (ok (default-to u0 (map-get? staked-balances account)))
)

;; Read-only: get allowance
(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances {owner: owner, spender: spender})))
)

;; Read-only: get total supply (SIP-10)
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; Read-only: get name (SIP-10)
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

;; Read-only: get symbol (SIP-10)
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

;; Read-only: get decimals (SIP-10)
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

;; Read-only: get token uri (SIP-10)
(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Helper functions for strings (since Clarity lacks built-ins)
(define-private (principal-to-string (p principal))
  (unwrap-panic (principal-to-ascii p))
)

(define-private (uint-to-string (n uint))
  (unwrap-panic (int-to-ascii (to-int n)))
)

(define-private (bool-to-string (b bool))
  (if b "true" "false")
)
