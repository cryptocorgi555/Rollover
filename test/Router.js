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
    });

    describe("Deployment", () => {
        it("Should deploy correctly", async () => {
            logger(`Account deployed with: ${deployer.address}`);
            // expect(await router.owner()).to.equal(deployer.address);
            expect(await router.rulerCore()).to.equal(RULER_CORE_CONTRACT)
        });
    });

    describe("Individual Functions", () => {
        it("Should get mint value", async () => {
            mintRatio = await router.getPairMintInfo(WETH_CONTRACT_ADDRESS);
            expect(mintRatio).to.not.equal(0);
            logger(`Mint Ratio: ${mintRatio}`);
        });
        it("Should get expiry", async () => {
            expiry = await router.getPairExpiryInfo(WETH_CONTRACT_ADDRESS);
            expect(expiry).to.not.equal(0);
            logger(`Expiry: ${expiry}`);
        });
        it("Should get rr token", async () => {
            rrTokenAddress = await router.getPairRRToken(WETH_CONTRACT_ADDRESS);
            expect(rrTokenAddress).to.not.equal("");
            logger(`rrToken: ${rrTokenAddress}`);
        });
        it("Should get rc token", async () => {
            rcTokenAddress = await router.getPairRCToken(WETH_CONTRACT_ADDRESS);
            expect(rcTokenAddress).to.not.equal("");
            logger(`rrToken: ${rcTokenAddress}`);
        });
        it("Should get pair", async () => {
            pair = await router.getPairForCollateral(WETH_CONTRACT_ADDRESS);
            expect(pair).to.not.equal("");
            logger(`Pair: ${pair}`);
        });
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

            // Get the information about the current pair.
            await router.rolloverLoan(rollowerData, rollowerData);

        });
    });


});

// Questions
// 1. Could not deploy from the donor address. 
// 2. Something wrong wiht the transfer of funds. They do not dissapear from the router address.


// TO_DO
// 1. Get the flash loan fee so router gets approved. This can be done on the client. 
// 2. Figure this parameter as bytes or roloverdata in router.
// 3. Argument verification.