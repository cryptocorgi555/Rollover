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
    const RULER_CORE_CONTRACT_ADDRESS = "0xF19f4490A7fCCfEf2DaB8199ACDB2Dc1B9027C18";
    const COL_CONTRACT_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; //wETH
    const PAIRED_CONTRACT_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f"; //DAI
    const CURVE_FACTORY_ADRESS = "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE";
    const SWAP_POOL_CURVE_ADRESS = "0x56680FDEbDd3e31f79938fa1222bFea4706a0758";
    
    let PAIR, COL;
    let deployer, donor, user1;
    let rrToken, rrTokenAddress;
    let rcToken, rcTokenAddress;
    let Router, router, mintRatio, expiry;
    const COLCNT = 1
    let COL_AMT = ethers.utils.parseUnits(COLCNT.toString(), 18); //Colllaterla count in wei
    let LOAN_AMOUNT, FEE_AMOUNT;

    const ERC20ABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/IERC20.json")));
    const RULERCOREABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/RulerCore.json")));

    before(async () => {
        //Deploy the router contract
        Router = await ethers.getContractFactory("Router");
        router = await Router.deploy(RULER_CORE_CONTRACT_ADDRESS, CURVE_FACTORY_ADRESS);
            
        //Impersonate the collateral donor account
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0xaae0633e15200bc9c50d45cd762477d268e126bd"]}
        )
        
        //Impersonate the borrower account 
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x9FEF86F76af2b459BBbb137918f8e589dB683381"]}
        )

        //Get signer accounts
        borrower = await ethers.getSigner("0x9FEF86F76af2b459BBbb137918f8e589dB683381")
        donor = await ethers.getSigner("0xaae0633e15200bc9c50d45cd762477d268e126bd");
        [deployer, user1] = await ethers.getSigners(); //Get the deployment address


        // Get the COL and DAI contracts
        COL = new ethers.Contract(COL_CONTRACT_ADDRESS, ERC20ABI, donor);
        PAIR = new ethers.Contract(PAIRED_CONTRACT_ADDRESS, ERC20ABI, donor);
        rulerCore = new ethers.Contract(RULER_CORE_CONTRACT_ADDRESS, RULERCOREABI, borrower);
        
        // Obtain the data related to the last pair of collateral. 
        let pairs = await rulerCore.getPairList(COL.address);
        pair = pairs[pairs.length - 1];
        mintRatio = pair.mintRatio;
        expiry = pair.expiry;
        rrTokenAddress = pair.rrToken;
        rcTokenAddress = pair.rcToken;
        LOAN_AMOUNT = mintRatio.mul(COLCNT); // This is how much loan in rc and rr you would get
        rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, deployer);
        rcToken = new ethers.Contract(rcTokenAddress, ERC20ABI, deployer); 
        
        await COL.transfer(router.address, COL_AMT); // COL for individual deposit function test
        await PAIR.transfer(router.address, LOAN_AMOUNT); // DAI for individual repay function test

    });

    describe("Deployment", () => {
        it("Should deploy correctly", async () => {
            logger(`Account deployed with: ${deployer.address}`);
            expect(await router.rulerCore()).to.equal(RULER_CORE_CONTRACT_ADDRESS)
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
            expect(await rcToken.balanceOf(router.address)).to.equal(LOAN_AMOUNT);
        });
    });

    describe("Intermediary Flashloan", () => {
        before(async () => {
            // Fetch the amount of debt the impersonated borrower has.
            LOAN_AMOUNT = await rrToken.balanceOf(borrower.address);
            // 21k * 0.085% 0.00085 ~ 17.85 Stable
            FEE_AMOUNT = ethers.BigNumber.from("17850000000000000000");
            // User will only need the difference between the loan amount he has + FL fee - cost of his new rc
            // FL is taken for the enitre loan amount dispite possibility that user might have some stable to lower this
            // Here I transfer him much more stables than he would ever need
            await PAIR.transfer(borrower.address, LOAN_AMOUNT.add(FEE_AMOUNT));
        });

        it("Should setup correctly", async () => {
            expect(await rrToken.balanceOf(borrower.address)).to.equal(LOAN_AMOUNT);
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await PAIR.balanceOf(borrower.address)).to.equal(LOAN_AMOUNT.add(FEE_AMOUNT));
            expect(await PAIR.balanceOf(router.address)).to.equal(0);
        });

        it("Should do the flashloan", async () => {

            rollowerData = {
                user: borrower.address,
                pairedToken: PAIRED_CONTRACT_ADDRESS, 
                pairedAmt: LOAN_AMOUNT,
                colToken: COL_CONTRACT_ADDRESS,
                expiryOld: expiry,
                mintRatioOld: mintRatio,
                expiryNew: expiry, //This normally would be different
                mintRatioNew: mintRatio, // This normally would be different 
                swapPool: SWAP_POOL_CURVE_ADRESS
            };

            // Connect to the tokens as a borrower
            rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, borrower);
            PAIR = new ethers.Contract(PAIRED_CONTRACT_ADDRESS, ERC20ABI, borrower);

            await rrToken.approve(router.address, LOAN_AMOUNT);
            await PAIR.approve(router.address, LOAN_AMOUNT.add(FEE_AMOUNT)); //Much exsessive
            await router.rolloverLoan(rollowerData);
            
            expect(LOAN_AMOUNT.add(FEE_AMOUNT).sub((await PAIR.balanceOf(borrower.address)))).to.not.equal(0);

            expect(await rrToken.balanceOf(borrower.address)).to.equal(LOAN_AMOUNT);
        });
    });
});