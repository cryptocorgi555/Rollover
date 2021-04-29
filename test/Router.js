const { expect } = require('chai');
const fs = require('fs');
const path = require("path");

LOGGER = false;

function logger(message){
    if (LOGGER === true){
        console.log(message);
    }
}

describe("Router", function() {
    const RULER_CORE_CONTRACT = "0xF19f4490A7fCCfEf2DaB8199ACDB2Dc1B9027C18";
    const COL_CONTRACT_ADDRESS = "0x41d5d79431a913c4ae7d69a668ecdfe5ff9dfb68";
    const PAIRED_CONTRACT_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const CURVE_FACTORY = "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE";
    const SWAP_POOL_CURVE = "0x883F7d4B6B24F8BF1dB980951Ad08930D9AEC6Bc";
    const BLACK_HOLE = "0x0000000000000000000000000000000000000000";
    
    let PAIR, COL;
    let deployer, donor, user1;
    let rrToken, rrTokenAddress;
    let rcToken, rcTokenAddress;
    let Router, router, mintRatio, expiry;

    const COL_AMT = ethers.utils.parseUnits("1", 18); //Changing from one will affect the LOAN_AMOUNT var.
    // const LOAN_AMOUNT = ethers.utils.parseUnits("50", 18);
    // let loan_fee = ethers.utils.parseUnits("56", 15);
    let LOAN_AMOUNT;

    const ERC20ABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/IERC20.json")));
    const RULERCOREABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/RulerCore.json")));

    before(async () => {
        [deployer, user1] = await ethers.getSigners(); //Get the deployment address
            
        //Impersonate the donor account
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0xD3B325b9c7aA33c8E19f33bBCD6B2FBE3Ac66fa7"]}
        )
        donor = await ethers.provider.getSigner("0xD3B325b9c7aA33c8E19f33bBCD6B2FBE3Ac66fa7")


        //Deploy the router contract
        Router = await ethers.getContractFactory("Router");
        router = await Router.deploy(RULER_CORE_CONTRACT, CURVE_FACTORY);

        // Get the COL and DAI contracts
        COL = new ethers.Contract(COL_CONTRACT_ADDRESS, ERC20ABI, donor);
        PAIR = new ethers.Contract(PAIRED_CONTRACT_ADDRESS, ERC20ABI, donor);
        
        // await PAIR.transfer(user1.address, loan_fee); //DAI for repay and FL fee
        // logger("Transfered all")
        // Get the RulerCore contract and necessary data
        rulerCore = new ethers.Contract(RULER_CORE_CONTRACT, RULERCOREABI, donor);
        let pairs = await rulerCore.getPairList(COL.address)
        let pair = pairs[pairs.length - 1];
        mintRatio = pair.mintRatio;
        expiry = pair.expiry;
        rrTokenAddress = pair.rrToken;
        rcTokenAddress = pair.rcToken;
        LOAN_AMOUNT = mintRatio;
        rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, deployer);
        rcToken = new ethers.Contract(rcTokenAddress, ERC20ABI, deployer); 
        
       
        await COL.transfer(router.address, COL_AMT); // COL for individual deposit function test
        await PAIR.transfer(router.address, LOAN_AMOUNT); // DAI for individual repay function test

    });

    describe("Deployment", () => {
        it("Should deploy correctly", async () => {
            logger(`Account deployed with: ${deployer.address}`);
            expect(await router.rulerCore()).to.equal(RULER_CORE_CONTRACT)
        });
        it("Should send correct funds to accounts", async () => {
            expect(await COL.balanceOf(router.address)).to.equal(COL_AMT);
            expect(await PAIR.balanceOf(router.address)).to.equal(LOAN_AMOUNT);
        });
    });

    describe("Individual Functions", () => {
        it("Should deposit funds correctly", async () => {
            await router.depositFunds(COL_CONTRACT_ADDRESS, 
                                      PAIRED_CONTRACT_ADDRESS, 
                                      COL_AMT,
                                      expiry,
                                      mintRatio);
            expect(await rrToken.balanceOf(router.address)).to.equal(LOAN_AMOUNT);
            expect(await rcToken.balanceOf(router.address)).to.equal(LOAN_AMOUNT);
            expect(await COL.balanceOf(router.address)).to.equal(0);
        });
        it("Should repay funds correctly", async () => {
            await router.repayFunds(COL_CONTRACT_ADDRESS, 
                                    PAIRED_CONTRACT_ADDRESS, 
                                    LOAN_AMOUNT,
                                    expiry,
                                    mintRatio); 

            expect(await COL.balanceOf(router.address)).to.equal(COL_AMT);
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await PAIR.balanceOf(router.address)).to.equal(0);
        });
    });

    describe("Intermediary Flashloan", () => {
        before(async () => {
            // Test setup. 
            // User has some amout of collateral. That is deposited to create some debt. 
            // User will have some rrTokens as well as rcTokens.
            // Send some rc tokens to the black hole
            // We then try to do the rollower call and end up with some DAI.
            // User needs some DAI 
            PAIR.transfer(user1.address, ethers.utils.parseUnits("100", 18));
            router = router.connect(user1);
            
            await COL.transfer(user1.address, COL_AMT);
            await router.depositAndSend(COL_CONTRACT_ADDRESS, 
                PAIRED_CONTRACT_ADDRESS, 
                COL_AMT,
                expiry,
                mintRatio); //This needs to be replaced after I figure our how to get the rcToken where I need them

        });

        it("Should setup correctly", async () => {
            expect(await rrToken.balanceOf(user1.address)).to.equal(LOAN_AMOUNT);
            expect(await rcToken.balanceOf(router.address)).to.equal(LOAN_AMOUNT.mul(ethers.BigNumber.from("2")));
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await PAIR.balanceOf(router.address)).to.equal(0);
            expect(await PAIR.balanceOf(user1.address)).to.equal(ethers.utils.parseUnits("100", 18));
        });

        // it("Should do curve swap", async () => {
        //     // await PAIR.approve(router.address, loan_fee);

        //     rollowerData = {
        //         pairedToken: PAIRED_CONTRACT_ADDRESS, 
        //         pairedAmt: LOAN_AMOUNT,
        //         colToken: COL_CONTRACT_ADDRESS,
        //         colAmt: COL_AMT,
        //         expiry: expiry,
        //         mintRatio: mintRatio,
        //         swapPool: SWAP_POOL_CURVE,
        //     };

        //     let index = await router.curveTestInterraction(rollowerData);

        //     // expect(await DAI.balanceOf(user1.address)).to.equal(0);
        //     // expect(await DAI.balanceOf(router.address)).to.equal(0);
        // });

        it("Should do the flashloan", async () => {
            // await DAI.approve(router.address, loan_fee);

            rollowerData = {
                user: user1.address,
                pairedToken: PAIRED_CONTRACT_ADDRESS, 
                pairedAmt: LOAN_AMOUNT,
                colToken: COL_CONTRACT_ADDRESS,
                colAmt: COL_AMT,
                expiry: expiry,
                mintRatio: mintRatio,
                swapPool: SWAP_POOL_CURVE
            };

            console.log(user1.address);
            console.log(LOAN_AMOUNT)
            // console.log(router.address);
            // console.log(deployer.address);
            // console.log(donor.address);
            rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, user1);
            PAIR = new ethers.Contract(PAIRED_CONTRACT_ADDRESS, ERC20ABI, user1);
            await rrToken.approve(router.address, LOAN_AMOUNT);
            await PAIR.approve(router.address, ethers.utils.parseUnits("100", 18));
            await router.rolloverLoan(rollowerData, rollowerData);
            expect(await PAIR.balanceOf(user1.address)).to.not.equal(ethers.utils.parseUnits("100", 18));
            expect(await rrToken.balanceOf(user1.address)).to.equal(LOAN_AMOUNT);
        });
    });
});

// Questions
// 1. Could not deploy from the donor address. 
// 2. Something wrong wiht the transfer of funds. They do not dissapear from the router address.
// 3. What is mmDeposit and depositWithPermit?


// TO_DO
// 1. Get the flash loan fee so router gets approved the exact amount. This can be done on the client. 
// 2. Figure this parameter as bytes or roloverdata in router.
// 3. Argument verification.
// 4. Compute the loan fee
// 5. mintRatio to string 