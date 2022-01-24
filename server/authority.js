/*


Import this module in server app using: 
const auth = require("./authority.js");

Call function auth.authorize(txId, fromChainId), 
where:
    `txId` - transaction hash, 
    `fromChainId` - chain ID where transaction was sent.
returns JSON object,
where:
if all good:
    "isSuccess" - true,
    "signature" - authority signature,
    "token" - token to receive,
    "value" - tokens amount,
    "to"- receiver (user's) address,
    "chainId" - chain ID where to claim token,
    "bridge" - address of bridge on destination network.

in case of error: 
    "isSuccess" - false,
    "message" - error description


Example:

    auth.authorize(txId, fromChainId)
    .then(resp => {
        response.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
        response.end(JSON.stringify(resp));

    })
    .catch(err => {
        response.writeHead(404, {'Content-Type': 'text/html'});
        response.end(err.toString());            
    })


In this example of `.env` the authority address is 0x3d40De3046a7D7E2Aa9E8097A86e49c699A0170B
*/

const Web3 = require('web3');
require('dotenv').config(); // if use .env file for enviroment variables

const pk = process.env.AUTHORITY_PK;  // Private key should be hidden

const blockConfirmations = {
    "20729" : 1, // CLO test net
    "820" : 1, // CLO main net
    "97" : 1,  // BSC test net
    "56" : 1,  // BSC main net
    "42" : 1,  // ETH KOVAN test net 
    "1"  : 1,   // ETH main net
    "61" : 1,  // ETC main net
    "199": 1,  // BTTC main net    
}

const bridgeContracts = {
    "20729" : "0xE1AF7a91EBC36E66D89a6201680dC5242796b246", // CLO test net
    "820" : "0x9a1fc8C0369D49f3040bF49c1490E7006657ea56", // CLO main net
    "97" : "0x3777c0b1CBFC65743149D5559db0bC199B7C647c",  // BSC test net
    "56" : "0x9a1fc8C0369D49f3040bF49c1490E7006657ea56",  // BSC main net
    "42" : "0x9b5e4b10b405cd5cd4b056a1b57c1c653379db3c",  // ETH KOVAN test net 
    "1" : "0x9a1fc8C0369D49f3040bF49c1490E7006657ea56",   // ETH main net
    "61" : "0x9a1fc8C0369D49f3040bF49c1490E7006657ea56",  // ETC main net
    "199": "0x9a1fc8C0369D49f3040bF49c1490E7006657ea56",  // BTTC main net
};

const providers = {
    "20729" : "https://testnet-rpc.callisto.network", // CLO test net
    "820" : "https://clo-geth.0xinfra.com/", // CLO main net
    "97" : "https://data-seed-prebsc-1-s2.binance.org:8545/",  // BSC test net
    "56" : "https://bsc-dataseed.binance.org/",  // BSC main net
    "42" : "https://kovan.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",  // ETH KOVAN test net 
    "1" : "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161",   // ETH main net
    "61" : "https://www.ethercluster.com/etc", // ETC main net
    "199": "https://rpc.bt.io/",  // BTTC main net
}

const deposit_event_abi = [
    {"type":"address","name":"token","internalType":"address","indexed":true},
    {"type":"address","name":"sender","internalType":"address","indexed":true},
    {"type":"uint256","name":"value","internalType":"uint256","indexed":false},
    {"type":"uint256","name":"toChainId","internalType":"uint256","indexed":false},
    {"type":"address","name":"toToken","internalType":"address","indexed":false}
];

const BridgeToContract_event_abi = [
    {"type":"address","name":"token","internalType":"address","indexed":true},
    {"type":"address","name":"sender","internalType":"address","indexed":true},
    {"type":"uint256","name":"value","internalType":"uint256","indexed":false},
    {"type":"uint256","name":"toChainId","internalType":"uint256","indexed":false},
    {"type":"address","name":"toToken","internalType":"address","indexed":false},
    {"type":"address","name":"toContract","internalType":"address","indexed":false},
    {"type":"bytes","name":"data","internalType":"bytes","indexed":false}
];

// call this function to get authorization signature
// params: txId = deposit transaction hash, fromChainId = chain ID where transaction was sent.
// returns: on success {isSuccess: true, message: sig.signature};
// on error: {isSuccess: false, message: error_message}; 
async function authorize(txId, fromChainId) {
    var provider = providers[fromChainId];
    var bridgeContract = bridgeContracts[fromChainId];
    if (!bridgeContract) {
        let msg = "No bridgeContract for chain ID:" + fromChainId;
        //console.log(msg);
        return {isSuccess: false, message: msg};
    }
    if (!provider) {
        let msg = "No provider for chain ID:" + fromChainId;
        //console.log(msg);
        return {isSuccess: false, message: msg};
    }
    var web3 = new Web3(provider);
    var lastBlock = await web3.eth.getBlockNumber();

    return web3.eth.getTransactionReceipt(txId)
    .then(receipt => {
        if (receipt && receipt.status) {
            if (lastBlock - receipt.blockNumber < blockConfirmations[fromChainId]) { // require at least 12 confirmation
                let msg = "Confirming: " + (lastBlock - receipt.blockNumber) + " of " + blockConfirmations[fromChainId];
                console.log(msg);
                return {isSuccess: false, message: msg};
            }
            for (var i = 0; i < receipt.logs.length; i++) {
                let element = receipt.logs[i];
                if (element.topics[0] == "0xf5dd9317b9e63ac316ce44acc85f670b54b339cfa3e9076e1dd55065b922314b"  // Deposit
                    && element.address == bridgeContract
                    && element.transactionHash == txId) 
                {
                    element.topics.shift(); // remove 
                    let p = web3.eth.abi.decodeLog(deposit_event_abi, element.data, element.topics);
                    //console.log(p);
                    let messageHash = web3.utils.soliditySha3(p.toToken, p.sender, p.value, txId, fromChainId, p.toChainId);
                    //console.log(messageHash);
                    sig = web3.eth.accounts.sign(messageHash, pk);
                    //console.log(sig);
                    let ret = {isSuccess: true, signature: sig.signature, token: p.toToken, value: p.value, to: p.sender, chainId: p.toChainId, bridge: bridgeContracts[p.toChainId]};
                    //console.log(ret);
                    return ret;
                } else if (element.topics[0] == "0x8e3af9ffa3a105195ae58520a6e3ab241268521cd0a0ca519896e650d4fbebe4"   // BridgeToContract
                    && element.address == bridgeContract
                    && element.transactionHash == txId) 
                {
                    element.topics.shift(); // remove 
                    var p = web3.eth.abi.decodeLog(BridgeToContract_event_abi, element.data, element.topics);
                    //console.log(p);
                    var messageHash = web3.utils.soliditySha3(p.toToken, p.sender, p.value, txId, fromChainId, p.toChainId, p.toContract, p.data);
                    //console.log(messageHash);
                    sig = web3.eth.accounts.sign(messageHash, pk);
                    //console.log(sig);
                    let ret = {isSuccess: true, signature: sig.signature, token: p.toToken, value: p.value, to: p.sender, chainId: p.toChainId, toContract: p.toContract, data: p.data, bridge: bridgeContracts[p.toChainId]};
                    //console.log(ret);
                    return ret;
                }
            }
        }
        let msg = "Wrong transaction hash:" + txId;
        console.log(msg);
        return {isSuccess: false, message: msg};   
    })
    .catch(err => {
        console.log(err);
        return {isSuccess: false, message: err.toString()};
    })
}

module.exports.authorize = authorize;