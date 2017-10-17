import ganache from 'ganache-core'
import lolex from 'lolex'
import memdown from 'memdown'
import td from 'testdouble'
import Web3 from 'web3'

const clock = lolex.createClock(0)
export {clock}
td.replace('../lib/timers', {clear: clock.clearTimeout, set: clock.setTimeout})

const makeProvider = td.replace('../lib/provider')

// Use require() since this should be loaded after module stubs have been
// configured.
const FinalityWatcher = require('..')

const makeMineBlock = (provider, addresses, nonces = new Map()) => async () => {
  const [from, to] = addresses
  const nonce = nonces.get(from) || 0
  nonces.set(from, nonce)

  return new Promise((resolve, reject) => {
    const web3 = new Web3(provider)
    web3.eth.sendTransaction({from, to, value: 1}, (sendErr, hash) => {
      if (sendErr) return reject(sendErr)

      web3.eth.getTransactionReceipt(hash, (receiptErr, receipt) => {
        if (receiptErr) return reject(receiptErr)
        if (!receipt) return reject(new Error('Could not get receipt'))

        resolve({number: receipt.blockNumber, hash: receipt.blockHash})
      })
    })
  })
}

const seenTitles = new Set()
export default (setup = () => {}) => {
  if (typeof setup === 'function') {
    setup = {run: setup}
  }

  return async t => {
    // Titles are used to ensure each watcher instance gets the correct Web3 provider.
    if (seenTitles.has(t.title)) throw new Error(`Test title has already been used: ${t.title}`)
    seenTitles.add(t.title)

    const provider = ganache.provider({
      accounts: [
        {balance: 10e18},
        {balance: 0}
      ],
      db: memdown(),
      mnemonic: 'i’ll be with you lost boys',
      locked: true
    })

    const addresses = Object.keys(provider.manager.state.accounts)

    const ethereumNode = `ethereumNode (${t.title})`
    td.when(makeProvider(ethereumNode)).thenReturn(provider)

    let watcher
    const promise = new Promise(async (resolve, reject) => {
      const {
        blockchainConfirmationDelay,
        defaultInterval = false,
        interval = 10,
        onError = (_, err) => reject(err),
        wrapWeb3Error
      } = setup

      watcher = new FinalityWatcher({
        blockchainConfirmationDelay,
        ethereumNode,
        interval: defaultInterval ? undefined : interval,
        onError (...args) {
          return onError(t, ...args)
        },
        wrapWeb3Error
      })

      const {getBlock} = watcher
      let pendingRequests = []
      watcher.getBlock = (...args) => {
        const pending = new Promise((resolveRequest, rejectRequest) => { // eslint-disable-line promise/param-names
          const result = getBlock.apply(watcher, args)
          pendingRequests.push({
            fail (err) {
              rejectRequest(err)
              return pending.catch(() => {})
            },
            flush () {
              resolveRequest(result)
              return pending
            }
          })
        })
        return pending
      }
      const failRequests = async err => {
        const requests = pendingRequests
        pendingRequests = []
        await Promise.all(requests.map(request => request.fail(err)))
      }
      const flushRequests = async () => {
        const requests = pendingRequests
        pendingRequests = []
        await Promise.all(requests.map(request => request.flush()))
      }

      const initialBlock = await getBlock.call(watcher, 0).then(({hash, number}) => ({hash, number}))

      t.context = {
        addresses,
        done: resolve,
        failRequests,
        flushRequests,
        initialBlock,
        interval,
        mineBlock: makeMineBlock(provider, addresses),
        provider,
        watcher
      }

      if (setup.run) {
        try {
          await setup.run(t)
        } catch (err) {
          reject(err)
        }
      }

      resolve()
    })

    try {
      await promise
    } finally {
      if (watcher) watcher.stop()
    }
  }
}
