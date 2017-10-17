'use strict'

const LRU = require('lru-cache')

const timers = require('./lib/timers')
const {makeGetBlock} = require('./lib/web3')

// Cache up to 500 known final blocks.
const CACHE_SIZE = 500

// Check for new blocks every 30 seconds.
const DEFAULT_INTERVAL = 30e3

class FinalityWatcher {
  constructor ({
    blockchainConfirmationDelay = 0,
    ethereumNode,
    interval = DEFAULT_INTERVAL,
    onError,
    wrapWeb3Error = err => err
  }) {
    this.blockchainConfirmationDelay = blockchainConfirmationDelay
    this.interval = interval
    this.onError = onError

    this.getBlock = makeGetBlock(ethereumNode, wrapWeb3Error)

    this.finalBlocks = new LRU(CACHE_SIZE)
    this.mostRecentFinalBlockNumber = 0
    this.pending = new Set()

    this.busy = false
    this.stopping = false
    this.timer = null
  }

  stop () {
    this.stopping = true
    if (this.timer) {
      timers.clear(this.timer)
      this.timer = null
    }
  }

  // Resolves with `true` when the final block at `blockNumber` has `blockHash`
  // as its hash, `false` otherwise.
  async isFinal (blockNumber, blockHash) {
    // Return immediately if the block is known to be final.
    if (this.finalBlocks.has(blockNumber)) return this.finalBlocks.get(blockNumber) === blockHash

    return new Promise(resolve => {
      // Remain pending.
      if (this.stopping) return

      const record = {
        blockNumber,
        onFinal: hash => {
          resolve(blockHash === hash)
          this.pending.delete(record)
        }
      }
      this.pending.add(record)

      this.poll()
    })
  }

  // Periodically checks for new blocks, and notifies for pending blocks when
  // they've become final.
  async poll () {
    if (this.busy) return

    // Allow poll() to execute immediately when isFinal() is called, without
    // waiting for the timer to fire.
    if (this.timer !== null) {
      clearTimeout(this.timer)
    }

    this.busy = true

    let updatedFinalBlockNumber = false
    let latest = this.mostRecentFinalBlockNumber

    try {
      for (const pending of this.pending) {
        // Check if the pending block is old enough.
        if ((latest - pending.blockNumber) < this.blockchainConfirmationDelay) {
          // The pending block is too young, assuming `latest` is up to date.
          if (updatedFinalBlockNumber) continue

          // Update `latest`
          // TODO: Abort this request when stopping. Web3 does not currently
          // support this.
          ({number: latest} = await this.getBlock('latest'))
          updatedFinalBlockNumber = true
          this.mostRecentFinalBlockNumber = latest

          // Bail if the watcher is being stopped since getBlock() began.
          if (this.stopping) break

          // Check again
          if ((latest - pending.blockNumber) < this.blockchainConfirmationDelay) {
            continue
          }
        }

        if (this.finalBlocks.has(pending.blockNumber)) {
          // Provide the hash to the pending record.
          pending.onFinal(this.finalBlocks.get(pending.blockNumber))
        } else {
          // Get the final hash for the pending block.
          // TODO: Abort this request when stopping. Web3 does not currently
          // support this.
          const {hash} = await this.getBlock(pending.blockNumber)

          // Bail if the watcher is being stopped since getBlock() began.
          if (this.stopping) break

          // Cache the final hash.
          this.finalBlocks.set(pending.blockNumber, hash)
          // Provide the hash to the pending record.
          pending.onFinal(hash)
        }
      }
    } catch (err) {
      this.onError(err)
    }

    this.busy = false
    if (this.pending.size > 0) {
      this.timer = timers.set(() => {
        this.timer = null
        this.poll()
      }, this.interval)
    }
  }
}
module.exports = FinalityWatcher
