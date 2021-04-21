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
    const RULER_CORE_CONTRACT = "0xa5036f6C30fd87fC425eEcACa42D83fc61d581C0";
    const WETH_CONTRACT_ADDRESS = "0x90ec9Fe476a51Bd846238a5c79D78a23152Fc9CD";
    const DAI_CONTRACT_ADDRESS = "0x558B5CE2f1c1Fed4F25457A73A6C49A2d309958E";
    
    let DAI, wETH;
    let deployer, donor, user1;
    let rrToken, rrTokenAddress;
    let rcToken, rcTokenAddress;
    let Router, router, mintRatio, expiry;

    const weth_tenth = ethers.utils.parseUnits("0.1", 18);
    const loan_amount = ethers.utils.parseUnits("60", 18);
    const loan_fee = ethers.utils.parseUnits("51", 15);

    const ERC20ABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/IERC20.json")));
    const RULERCOREABI = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./abi/RulerCore.json")));

    before(async () => {
        [deployer, user1] = await ethers.getSigners(); //Get the deployment address
            
        //Impersonate the donor account
        await hre.network.provider.request({
            method: "hardhat_impersonateAccount",
            params: ["0x97C74308CFdE2775FbD987baFCA68a72FB01Dd01"]}
        )
        donor = await ethers.provider.getSigner("0x97C74308CFdE2775FbD987baFCA68a72FB01Dd01")

        //Deploy the router contract
        Router = await ethers.getContractFactory("Router");
        router = await Router.deploy(RULER_CORE_CONTRACT);
        logger(`Contract signer: ${router.signer.address}`)

        // Get the wETH and DAI contracts
        wETH = new ethers.Contract(WETH_CONTRACT_ADDRESS, ERC20ABI, donor);
        DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, donor);
        await wETH.transfer(router.address, weth_tenth); // wETH for individual deposit function test
        await DAI.transfer(router.address, loan_amount); // DAI for individual repay function test
        await DAI.transfer(user1.address, loan_fee); //DAI for repay and FL fee

        // Get the RulerCore contract and necessary data
        rulerCore = new ethers.Contract(RULER_CORE_CONTRACT, RULERCOREABI, donor);
        expiry = (await rulerCore.getPairList(wETH.address))[0].expiry;
        mintRatio = (await rulerCore.getPairList(wETH.address))[0].mintRatio;
        rrTokenAddress = (await rulerCore.getPairList(wETH.address))[0].rrToken;
        rcTokenAddress = (await rulerCore.getPairList(wETH.address))[0].rcToken;
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
            expect(await wETH.balanceOf(router.address)).to.equal(weth_tenth);
            expect(await DAI.balanceOf(user1.address)).to.equal(loan_fee);
            expect(await DAI.balanceOf(router.address)).to.equal(loan_amount);
        });
    });

    describe("Individual Functions", () => {
        it("Should deposit funds correctly", async () => {
            await router.depositFunds(WETH_CONTRACT_ADDRESS, 
                                      DAI_CONTRACT_ADDRESS, 
                                      weth_tenth,
                                      expiry,
                                      mintRatio);
            expect(await rrToken.balanceOf(router.address)).to.equal(loan_amount);
            expect(await rcToken.balanceOf(router.address)).to.equal(loan_amount);
            expect(await wETH.balanceOf(router.address)).to.equal(0);
        });
        it("Should repay funds correctly", async () => {
            await router.repayFunds(WETH_CONTRACT_ADDRESS, 
                                    DAI_CONTRACT_ADDRESS, 
                                    loan_amount,
                                    expiry,
                                    mintRatio); 

            expect(await wETH.balanceOf(router.address)).to.equal(weth_tenth);
            expect(await rrToken.balanceOf(router.address)).to.equal(0);
            expect(await DAI.balanceOf(router.address)).to.equal(0);
        });
    });

    describe("Intermediary Flashloan", () => {
        before(async () => {
            await DAI.transfer(router.address, loan_amount); //This should not be here, need to swap rc for dai inside router.
            DAI = new ethers.Contract(DAI_CONTRACT_ADDRESS, ERC20ABI, user1);
            router = router.connect(user1);

            await router.depositFunds(WETH_CONTRACT_ADDRESS, 
                DAI_CONTRACT_ADDRESS, 
                weth_tenth,
                expiry,
                mintRatio);

            expect(await rrToken.balanceOf(router.address)).to.equal(loan_amount);
            expect(await wETH.balanceOf(router.address)).to.equal(0);
        });

        it("Should do the flashloan", async () => {
            await DAI.approve(router.address, loan_fee);

            rollowerData = {
                pairedToken: DAI_CONTRACT_ADDRESS, 
                pairedAmt: loan_amount,
                colToken: WETH_CONTRACT_ADDRESS,
                colAmt: weth_tenth,
                expiry: expiry,
                mintRatio: mintRatio
            };

            await router.rolloverLoan(rollowerData, rollowerData);
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