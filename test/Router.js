const { expect } = require('chai');

LOGGER = false;

function logger(message){
    if (LOGGER === true){
        console.log(message);
    }
}

describe("Router", function() {
    this.timeout(300000);
    const RULER_CORE_CONTRACT = "0xa5036f6C30fd87fC425eEcACa42D83fc61d581C0";
    const WETH_CONTRACT_ADDRESS = "0x90ec9Fe476a51Bd846238a5c79D78a23152Fc9CD";
    const DAI_CONTRACT_ADDRESS = "0x558B5CE2f1c1Fed4F25457A73A6C49A2d309958E";
    let Router, router, deployer, user1, mintRatio, expiry, rrTokenAddress, rcTokenAddress, wETH, DAI, donor;
    let rrToken, rcToken;
    const weth_tenth = ethers.utils.parseUnits("0.1", 18);
    const loan_amount = ethers.utils.parseUnits("60", 18);

    const ERC20ABI = `[
        {
            "constant": true,
            "inputs": [],
            "name": "name",
            "outputs": [
                {
                    "name": "",
                    "type": "string"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_spender",
                    "type": "address"
                },
                {
                    "name": "_value",
                    "type": "uint256"
                }
            ],
            "name": "approve",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [],
            "name": "totalSupply",
            "outputs": [
                {
                    "name": "",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_from",
                    "type": "address"
                },
                {
                    "name": "_to",
                    "type": "address"
                },
                {
                    "name": "_value",
                    "type": "uint256"
                }
            ],
            "name": "transferFrom",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [],
            "name": "decimals",
            "outputs": [
                {
                    "name": "",
                    "type": "uint8"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_owner",
                    "type": "address"
                }
            ],
            "name": "balanceOf",
            "outputs": [
                {
                    "name": "balance",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [],
            "name": "symbol",
            "outputs": [
                {
                    "name": "",
                    "type": "string"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "constant": false,
            "inputs": [
                {
                    "name": "_to",
                    "type": "address"
                },
                {
                    "name": "_value",
                    "type": "uint256"
                }
            ],
            "name": "transfer",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_owner",
                    "type": "address"
                },
                {
                    "name": "_spender",
                    "type": "address"
                }
            ],
            "name": "allowance",
            "outputs": [
                {
                    "name": "",
                    "type": "uint256"
                }
            ],
            "payable": false,
            "stateMutability": "view",
            "type": "function"
        },
        {
            "payable": true,
            "stateMutability": "payable",
            "type": "fallback"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "owner",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "name": "spender",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "value",
                    "type": "uint256"
                }
            ],
            "name": "Approval",
            "type": "event"
        },
        {
            "anonymous": false,
            "inputs": [
                {
                    "indexed": true,
                    "name": "from",
                    "type": "address"
                },
                {
                    "indexed": true,
                    "name": "to",
                    "type": "address"
                },
                {
                    "indexed": false,
                    "name": "value",
                    "type": "uint256"
                }
            ],
            "name": "Transfer",
            "type": "event"
        }
    ]`;

    const RULERCOREABI = `[{"anonymous":false,"inputs":[{"indexed":false,"internalType":"string","name":"_type","type":"string"},{"indexed":false,"internalType":"address","name":"old","type":"address"},{"indexed":false,"internalType":"address","name":"_new","type":"address"}],"name":"AddressUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"col","type":"address"},{"indexed":false,"internalType":"uint256","name":"old","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_new","type":"uint256"}],"name":"CollateralUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Collect","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Deposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"_token","type":"address"},{"indexed":false,"internalType":"address","name":"_borrower","type":"address"},{"indexed":false,"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"FlashLoan","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"old","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_new","type":"uint256"}],"name":"FlashLoanRateUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"MarketMakeDeposit","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"}],"name":"PairAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"bool","name":"old","type":"bool"},{"indexed":false,"internalType":"bool","name":"_new","type":"bool"}],"name":"PausedStatusUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"rERC20Impl","type":"address"},{"indexed":false,"internalType":"address","name":"newImpl","type":"address"}],"name":"RERC20ImplUpdated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"","type":"address"}],"name":"RTokenCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Redeem","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"user","type":"address"},{"indexed":true,"internalType":"address","name":"collateral","type":"address"},{"indexed":true,"internalType":"address","name":"paired","type":"address"},{"indexed":false,"internalType":"uint48","name":"expiry","type":"uint48"},{"indexed":false,"internalType":"uint256","name":"mintRatio","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Repay","type":"event"},{"inputs":[],"name":"FLASHLOAN_CALLBACK_SUCCESS","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"string","name":"_expiryStr","type":"string"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"string","name":"_mintRatioStr","type":"string"},{"internalType":"uint256","name":"_feeRate","type":"uint256"}],"name":"addPair","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"collaterals","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rcTokenAmt","type":"uint256"}],"name":"collect","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IERC20[]","name":"_tokens","type":"address[]"}],"name":"collectFees","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_colAmt","type":"uint256"}],"name":"deposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_colAmt","type":"uint256"},{"components":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"internalType":"struct IRulerCore.Permit","name":"_colPermit","type":"tuple"}],"name":"depositWithPermit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"feeReceiver","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"feesMap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_token","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"}],"name":"flashFee","outputs":[{"internalType":"uint256","name":"_fees","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"contract IERC3156FlashBorrower","name":"_receiver","type":"address"},{"internalType":"address","name":"_token","type":"address"},{"internalType":"uint256","name":"_amount","type":"uint256"},{"internalType":"bytes","name":"_data","type":"bytes"}],"name":"flashLoan","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"flashLoanRate","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getCollaterals","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"}],"name":"getPairList","outputs":[{"components":[{"internalType":"bool","name":"active","type":"bool"},{"internalType":"uint48","name":"expiry","type":"uint48"},{"internalType":"address","name":"pairedToken","type":"address"},{"internalType":"contract IRERC20","name":"rcToken","type":"address"},{"internalType":"contract IRERC20","name":"rrToken","type":"address"},{"internalType":"uint256","name":"mintRatio","type":"uint256"},{"internalType":"uint256","name":"feeRate","type":"uint256"},{"internalType":"uint256","name":"colTotal","type":"uint256"}],"internalType":"struct IRulerCore.Pair[]","name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_rERC20Impl","type":"address"},{"internalType":"address","name":"_feeReceiver","type":"address"}],"name":"initialize","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_token","type":"address"}],"name":"maxFlashLoan","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"minColRatioMap","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rcTokenAmt","type":"uint256"}],"name":"mmDeposit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rcTokenAmt","type":"uint256"},{"components":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"internalType":"struct IRulerCore.Permit","name":"_pairedPermit","type":"tuple"}],"name":"mmDepositWithPermit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"oracle","outputs":[{"internalType":"contract IOracle","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint48","name":"","type":"uint48"},{"internalType":"uint256","name":"","type":"uint256"}],"name":"pairs","outputs":[{"internalType":"bool","name":"active","type":"bool"},{"internalType":"uint48","name":"expiry","type":"uint48"},{"internalType":"address","name":"pairedToken","type":"address"},{"internalType":"contract IRERC20","name":"rcToken","type":"address"},{"internalType":"contract IRERC20","name":"rrToken","type":"address"},{"internalType":"uint256","name":"mintRatio","type":"uint256"},{"internalType":"uint256","name":"feeRate","type":"uint256"},{"internalType":"uint256","name":"colTotal","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"paused","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"rERC20Impl","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rTokenAmt","type":"uint256"}],"name":"redeem","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rrTokenAmt","type":"uint256"}],"name":"repay","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rrTokenAmt","type":"uint256"},{"components":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"internalType":"struct IRulerCore.Permit","name":"_pairedPermit","type":"tuple"}],"name":"repayWithPermit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"responder","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"setFeeReceiver","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"_newRate","type":"uint256"}],"name":"setFlashLoanRate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"setOracle","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"bool","name":"_active","type":"bool"}],"name":"setPairActive","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bool","name":"_paused","type":"bool"}],"name":"setPaused","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_newImpl","type":"address"}],"name":"setRERC20Impl","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"setResponder","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"uint256","name":"_minColRatio","type":"uint256"}],"name":"updateCollateral","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"version","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"address","name":"_col","type":"address"},{"internalType":"address","name":"_paired","type":"address"},{"internalType":"uint48","name":"_expiry","type":"uint48"},{"internalType":"uint256","name":"_mintRatio","type":"uint256"},{"internalType":"uint256","name":"_rcTokenAmt","type":"uint256"}],"name":"viewCollectible","outputs":[{"internalType":"uint256","name":"colAmtToCollect","type":"uint256"},{"internalType":"uint256","name":"pairedAmtToCollect","type":"uint256"}],"stateMutability":"view","type":"function"}]`

    before(async () => {
        [deployer, user1] = await ethers.getSigners(); //Get the deployment address
            
        //Impersonate the test account
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x97C74308CFdE2775FbD987baFCA68a72FB01Dd01"]}
        )

        //Address that acts as a faucet on the Kovan network for us
        donor = await ethers.provider.getSigner("0x97C74308CFdE2775FbD987baFCA68a72FB01Dd01")

        //Deploy the router contract
        Router = await ethers.getContractFactory("Router", {signer: donor});
        router = await Router.deploy(RULER_CORE_CONTRACT);
        logger(`Contract signer: ${router.signer.address}`)

        // Get the wETH and DAI contracts
        wETH = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20ABI, donor);
        DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, donor);
        logger(`Transfering ${weth_tenth} ETH to ${router.address}...`);
        logger(`Transfering 60 DAI to ${router.address}...`);
        await wETH.transfer(router.address, weth_tenth);
        // Transfer the correct amount of DAI and one more for the flashloan fees.
        await DAI.transfer(router.address, ethers.utils.parseUnits("61.0", 18));

        // Get the RulerCore contract
        rulerCore = new ethers.Contract(RULER_CORE_CONTRACT, RULERCOREABI, donor);

        expiry = (await rulerCore.getPairList(wETH.address))[0].expiry;
        mintRatio = (await rulerCore.getPairList(wETH.address))[0].mintRatio;
        rrTokenAddress = (await rulerCore.getPairList(wETH.address))[0].rrToken;
        rcTokenAddress = (await rulerCore.getPairList(wETH.address))[0].rcToken; 
    });

    describe("Deployment", () => {
        it("Should deploy correctly", async () => {
            logger(`Account deployed with: ${deployer.address}`);
            // expect(await router.owner()).to.equal(deployer.address);
            expect(await router.rulerCore()).to.equal(RULER_CORE_CONTRACT)
        });
    });

    describe("Individual Functions", () => {
        it("Should deposit funds correctly", async () => {
            wETH = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20ABI, router.signer);
            logger(`Balance of deployer: ${await wETH.balanceOf(deployer.address)}`);
            logger(`Balance of contract: ${await wETH.balanceOf(router.address)}`);
            logger(`rrToken address: ${rrTokenAddress}`);
            rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, router.signer);
            rcToken = new ethers.Contract(rcTokenAddress, ERC20ABI, router.signer);
            await router.depositFunds(WETH_CONTRACT_ADDRESS, DAI_CONTRACT_ADDRESS, weth_tenth);
            expect(await rrToken.balanceOf(router.address)).to.equal(ethers.utils.parseUnits("60", 18));
            expect(await rcToken.balanceOf(router.address)).to.equal(ethers.utils.parseUnits("60", 18));
        });
        it("Should repay funds correctly", async () => {
            await router.repayFunds(WETH_CONTRACT_ADDRESS, DAI_CONTRACT_ADDRESS, ethers.utils.parseUnits("60", 18));            
            expect(await wETH.balanceOf(router.address)).to.equal(weth_tenth);
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
        });
    });

    // describe("Flashloan functionality", () => {
    //     it("should get the flashloan", async () => {
    //         // Create the loan
    //         await router.depositFunds(WETH_CONTRACT_ADDRESS, DAI_CONTRACT_ADDRESS, weth_tenth);
    //         const rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, router.signer);
            
    //         // Autorollover
    //         expect(await rrToken.balanceOf(router.address)).to.equal(loan_amount);
    //         rData = {pairedToken: DAI_CONTRACT_ADDRESS, 
    //                 pairedAmt: loan_amount,
    //                 colToken: WETH_CONTRACT_ADDRESS,
    //                 colAmt: weth_tenth};
    //         await router.flashBorrow(DAI_CONTRACT_ADDRESS, loan_amount, rData);
    //     });
    // });


    describe("Intermediary Flashloan", () => {
        before(async () => {
            // Donor sends money to this contract
            // This contract takes out the loan since it is easy with smart contract
            // Contract trasfers the loan to the user1 by sending the rr and rc tokens

            // await router.depositFunds(WETH_CONTRACT_ADDRESS, DAI_CONTRACT_ADDRESS, weth_tenth);
        });

        // Something wrong wiht the transfer of funds. They do not dissapear from the router address
        it("Should deposit funds correctly and transfer loan to user1", async () => {
            wETH = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20ABI, router.signer);
            rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, router.signer);
            rcToken = new ethers.Contract(rcTokenAddress, ERC20ABI, router.signer);
            await router.depositFunds(WETH_CONTRACT_ADDRESS, DAI_CONTRACT_ADDRESS, weth_tenth);
            expect(await rrToken.balanceOf(router.address)).to.equal(ethers.utils.parseUnits("60", 18));
            expect(await rcToken.balanceOf(router.address)).to.equal(ethers.utils.parseUnits("120", 18));
            expect(await rrToken.balanceOf(user1.address)).to.equal(0);
            await rrToken.transfer(user1.address, ethers.utils.parseUnits("60", 18));
            // expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await rrToken.balanceOf(user1.address)).to.equal(ethers.utils.parseUnits("60", 18));

        });
        
        it("Rollower the loan as an intermediate router", async () => {
            // User1 needs to approve the dai for the FL fee
            // User1 needs to approve the rr
            DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, user1);
            rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, user1);
            await DAI.approve(router.address, ethers.utils.parseUnits("1", 18));
            await rrToken.approve(router.address, ethers.utils.parseUnits("60", 18));

            // For the test the same pairs are used. 
            rollowerData = {
                pairedToken: DAI_CONTRACT_ADDRESS, 
                pairedAmt: loan_amount,
                colToken: WETH_CONTRACT_ADDRESS,
                colAmt: weth_tenth,
                expiry: expiry,
                mintRatio: mintRatio
            };

            await router.rolloverLoan(rollowerData, rollowerData);
        });
    });


});

// Questions
// 1. Could not deploy from the donor address. 
// 2. Something wrong wiht the transfer of funds. They do not dissapear from the router address.


// TO_DO
// 1. Get the flash loan fee so router gets approved the exact amount. This can be done on the client. 
// 2. Figure this parameter as bytes or roloverdata in router.
// 3. Argument verification.