// SPDX-License-Identifier: No License
pragma solidity ^0.8.0;

import "./ERC20/SafeERC20.sol";
import "./interfaces/IRERC20.sol";
import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IRulerCore.sol";
import "./utils/Ownable.sol";
import "hardhat/console.sol";

contract Router is Ownable{
    using SafeERC20 for IERC20;
    
    struct RolloverData {
        address pairedToken;
        uint256 pairedAmt;
        address colToken;
        uint256 colAmt;
        uint48 expiry;
        uint256 mintRatio;
    }

    IRulerCore public rulerCore;
    IERC3156FlashLender public flashLender;

    event DepositFunds(address _addr, address _col, address _paired, uint256 _colAmt, uint48 _expiry, uint256 _mintRatio);
    event RepayFunds(address _col, address _paired, uint48 _expiry, uint256 _mintRatio, uint256 _rrTokenAmt);
    event ChingizFlashLoan(address _col, address _paired, uint256 _colAmt);


    constructor(address _rulerCore){
        rulerCore = IRulerCore(_rulerCore);
        flashLender = IERC3156FlashLender(_rulerCore);
    }

    function getPairMintInfo(address _col) external view returns(uint256){
        return rulerCore.getPairList(_col)[0].mintRatio;
    }
    
    function getPairedTokenInfo(address _col) external view returns(address){
        return rulerCore.getPairList(_col)[0].pairedToken;
    }
    
    function getPairExpiryInfo(address _col) external view returns(uint256){
        return rulerCore.getPairList(_col)[0].expiry;
    }

    function getPairRRToken(address _col) external view returns(IERC20){
        return rulerCore.getPairList(_col)[0].rrToken;
    }

    function getPairRCToken(address _col) external view returns(IERC20){
        return rulerCore.getPairList(_col)[0].rcToken;
    }

    function getPairForCollateral(address _col) external view returns(Pair memory){
        return rulerCore.getPairList(_col)[0];
    }

    function depositFunds(
        address _col,
        address _paired,
        uint256 _colAmt
    ) public {
        //Check if collateral supported.
        // require rulerCore.getPairList(_col) length > 0
        uint48 _expiry = rulerCore.getPairList(_col)[0].expiry;
        uint256 _mintRatio = rulerCore.getPairList(_col)[0].mintRatio;
        
        //Get the address of the ERC20 token that would be a collateral
        IERC20 collateral = IERC20(_col);
        collateral.safeApprove(address(rulerCore), _colAmt);
        rulerCore.deposit(_col, _paired, _expiry, _mintRatio, _colAmt);
        emit DepositFunds(address(rulerCore), _col, _paired, _colAmt, _expiry, _mintRatio);
    }
    

    function repayFunds(
        address _col,
        address _paired,
        uint256 _pairedAmt
    ) public {
        uint48 _expiry = rulerCore.getPairList(_col)[0].expiry;
        uint256 _mintRatio = rulerCore.getPairList(_col)[0].mintRatio;
        IERC20 paired = IERC20(_paired);
        uint256 _rrTokenAmt = _pairedAmt;//paired.balanceOf(address(this));
        paired.safeApprove(address(rulerCore), _rrTokenAmt);
        rulerCore.repay(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
        emit RepayFunds(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
    }
    
    function rolloverLoan(
        RolloverData memory _currentLoanPair,
        RolloverData memory _newLoanPair
    ) external {     
        require(_currentLoanPair.pairedAmt <= flashLender.maxFlashLoan(_currentLoanPair.pairedToken), "RulerFlashBorrower: Insufficient lender reserves");
        RolloverData[2] memory params = [_currentLoanPair, _newLoanPair];
        flashLender.flashLoan(IERC3156FlashBorrower(address(this)), _currentLoanPair.pairedToken, _currentLoanPair.pairedAmt, abi.encode(params));

    }
    
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data) external returns (bytes32) {
        RolloverData memory rData = abi.decode(data, (RolloverData));
        require(msg.sender == address(flashLender), "RulerFlashBorrower: Untrusted lender");
        require(initiator == address(this), "RulerFlashBorrower: Untrusted loan initiator");
        
        // // Repay the old deposit.         
        // repayFunds(rData.colToken, token, amount);
        // // Deposit collateral once again at a later date. 
        // depositFunds(rData.colToken, token, rData.colAmt);
        
        uint256 amountOwed = amount + fee;
        // fees are adopting pulling strategy, Ruler contract will transfer fees
        IERC20(token).approve(address(flashLender), amountOwed);

        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
    
    
}

