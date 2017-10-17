# @digicat/ethereum-finality-watcher

This package can observe blocks on a
[web3.js](https://github.com/ethereum/web3.js/)-compatible
[Ethereum](https://ethereum.org/) network, providing callbacks for when a block
is considered final. Requires [Node.js](https://nodejs.org/en/) 8 or newer.

## Usage

```js
const FinalityWatcher = require('@digicat/ethereum-finality-watcher')

const watcher = new FinalityWatcher({
  // Number of blocks that need to be added before an earlier block is
  // considered final. Defaults to 0.
  blockchainConfirmationDelay: 0,
  ethereumNode: 'http://localhost:8545',
  interval: 30000, // Interval on which we check for finality. Default is 30s.

  onError (err) {
    // Called when an error occurred. Expected to be synchronous.
  },

  wrapWeb3Error (err) {
    // Allows for underlying Web3 errors to be wrapped in another Error class.
    // By default returns the error as-is.
    return err
  }
})

// Checks if the hash for the given block number, once that block is final,
// equals the given hash.
//
// Returns a promise that is fulfilled with the `true` if the final hash is
// indeed the same, `false` otherwise. The promise never rejects, and if the
// watcher is stopped the promise will remain pending.
const result = await watcher.isFinal(42, '0xd4e56740f876aef8c010b86a40d5f56745a118d0906a34e69aec8c0db1cb8fa3')

// Stops the watcher.
watcher.stop()
```
