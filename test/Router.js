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
    const DAI_CONTRACT_ADDRESS = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const CURVE_FACTORY = "0x0959158b6040D32d04c301A72CBFD6b39E21c9AE";
    const SWAP_POOL_CURVE = "0xac63c167955007d5166fec43255ad5675efc3102";
    
    let DAI, rCOL;
    let deployer, donor, user1;
    let rrToken, rrTokenAddress;
    let rcToken, rcTokenAddress;
    let Router, router, mintRatio, expiry;

    const rCOL_tenth = ethers.utils.parseUnits("0.1", 18);
    const loan_amount = ethers.utils.parseUnits("50", 18);
    const loan_fee = ethers.utils.parseUnits("56", 15);

    const ERC20ABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/IERC20.json")));
    const RULERCOREABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/RulerCore.json")));

    before(async () => {
        [deployer, user1] = await ethers.getSigners(); //Get the deployment address
            
        //Impersonate the donor account
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0xDd79dc5B781B14FF091686961ADc5d47e434f4B0"]}
        )
        donor = await ethers.provider.getSigner("0xDd79dc5B781B14FF091686961ADc5d47e434f4B0")

        //Deploy the router contract
        Router = await ethers.getContractFactory("Router");
        router = await Router.deploy(RULER_CORE_CONTRACT, CURVE_FACTORY);
        logger(`Contract signer: ${router.signer.address}`)

        // Get the rCOL and DAI contracts
        rCOL = new ethers.Contract(COL_CONTRACT_ADDRESS, ERC20ABI, donor);
        DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, donor);
        await rCOL.transfer(router.address, rCOL_tenth); // rCOL for individual deposit function test
        await DAI.transfer(router.address, loan_amount); // DAI for individual repay function test
        await DAI.transfer(user1.address, loan_fee); //DAI for repay and FL fee

        // Get the RulerCore contract and necessary data
        rulerCore = new ethers.Contract(RULER_CORE_CONTRACT, RULERCOREABI, donor);
        expiry = (await rulerCore.getPairList(rCOL.address))[0].expiry;
        mintRatio = (await rulerCore.getPairList(rCOL.address))[0].mintRatio;
        rrTokenAddress = (await rulerCore.getPairList(rCOL.address))[0].rrToken;
        rcTokenAddress = (await rulerCore.getPairList(rCOL.address))[0].rcToken;
        rrToken = new ethers.Contract(rrTokenAddress, ERC20ABI, donor);
        rcToken = new ethers.Contract(rcTokenAddress, ERC20ABI, donor); 
    });

    describe("Deployment", () => {
        it("Should deploy correctly", async () => {
            logger(`Account deployed with: ${deployer.address}`);
            // expect(await router.owner()).to.equal(deployer.address);
            expect(await router.rulerCore()).to.equal(RULER_CORE_CONTRACT)
        });
        it("Should send correct funds to accounts", async () => {
            expect(await rCOL.balanceOf(router.address)).to.equal(rCOL_tenth);
            expect(await DAI.balanceOf(user1.address)).to.equal(loan_fee);
            expect(await DAI.balanceOf(router.address)).to.equal(loan_amount);
        });
    });

    describe("Individual Functions", () => {
        it("Should deposit funds correctly", async () => {
            await router.depositFunds(COL_CONTRACT_ADDRESS, 
                                      DAI_CONTRACT_ADDRESS, 
                                      rCOL_tenth,
                                      expiry,
                                      mintRatio);
            expect(await rrToken.balanceOf(router.address)).to.equal(loan_amount);
            expect(await rcToken.balanceOf(router.address)).to.equal(loan_amount);
            expect(await rCOL.balanceOf(router.address)).to.equal(0);
        });
        it("Should repay funds correctly", async () => {
            await router.repayFunds(COL_CONTRACT_ADDRESS, 
                                    DAI_CONTRACT_ADDRESS, 
                                    loan_amount,
                                    expiry,
                                    mintRatio); 

            expect(await rCOL.balanceOf(router.address)).to.equal(rCOL_tenth);
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await DAI.balanceOf(router.address)).to.equal(0);
        });
    });

    describe("Intermediary Flashloan", () => {
        // before(async () => {
        //     await DAI.transfer(router.address, loan_amount); //This should not be here, need to swap rc for dai inside router.
        //     DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, user1);
        //     router = router.connect(user1);

        //     await router.depositFunds(COL_CONTRACT_ADDRESS, 
        //         DAI_CONTRACT_ADDRESS, 
        //         rCOL_tenth,
        //         expiry,
        //         mintRatio);

        //     expect(await rrToken.balanceOf(router.address)).to.equal(loan_amount);
        //     expect(await rCOL.balanceOf(router.address)).to.equal(0);
        // });

        it("Should do curve swap", async () => {
            await DAI.approve(router.address, loan_fee);

            rollowerData = {
                pairedToken: DAI_CONTRACT_ADDRESS, 
                pairedAmt: loan_amount,
                colToken: COL_CONTRACT_ADDRESS,
                colAmt: rCOL_tenth,
                expiry: expiry,
                mintRatio: mintRatio,
                // swapPool: SWAP_POOL_CURVE,
            };

            console.log(await router.curveTestInterraction(rollowerData, rollowerData));

            // expect(await DAI.balanceOf(user1.address)).to.equal(0);
            // expect(await DAI.balanceOf(router.address)).to.equal(0);
        });

        it("Should do the flashloan", async () => {
            await DAI.approve(router.address, loan_fee);

            rollowerData = {
                pairedToken: DAI_CONTRACT_ADDRESS, 
                pairedAmt: loan_amount,
                colToken: COL_CONTRACT_ADDRESS,
                colAmt: rCOL_tenth,
                expiry: expiry,
                mintRatio: mintRatio,
                swapPool: SWAP_POOL_CURVE
            };

            expect(await DAI.balanceOf(user1.address)).to.equal(0);
            expect(await DAI.balanceOf(router.address)).to.equal(0);
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