// SPDX-License-Identifier: No License
pragma solidity ^0.8.0;

import "./ERC20/SafeERC20.sol";
import "./interfaces/IRERC20.sol";
import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IRulerCore.sol";
import "./utils/Ownable.sol";
import "hardhat/console.sol";

/** @title Auto Loan Rollover Router. */
contract Router is Ownable{
    using SafeERC20 for IERC20;
    
    struct RolloverData {
        IERC20 pairedToken;
        uint256 pairedAmt;
        IERC20 colToken;
        uint256 colAmt;
        uint48 expiry;
        uint256 mintRatio;
    }

    IRulerCore public rulerCore;
    IERC3156FlashLender public flashLender;

    event DepositFunds(address _addr, address _col, address _paired, uint256 _colAmt, uint48 _expiry, uint256 _mintRatio);
    event RepayFunds(address _col, address _paired, uint48 _expiry, uint256 _mintRatio, uint256 _rrTokenAmt);


    constructor(address _rulerCore){
        rulerCore = IRulerCore(_rulerCore);
        flashLender = IERC3156FlashLender(_rulerCore);
    }


    /** @dev Deposits the funds on behalf of the user. Keeps the r tokens in itself.
      * @param _col Height of the rectangle.
      */
    function depositFunds(
        address _col,
        address _paired,
        uint256 _colAmt,
        uint48 _expiry,
        uint256 _mintRatio
    ) public {
        IERC20 collateral = IERC20(_col);
        collateral.safeApprove(address(rulerCore), _colAmt);
        rulerCore.deposit(_col, _paired, _expiry, _mintRatio, _colAmt);
        emit DepositFunds(address(rulerCore), _col, _paired, _colAmt, _expiry, _mintRatio);
    }
    
    function repayFunds(
        address _col,
        address _paired,
        uint256 _pairedAmt,
        uint48 _expiry,
        uint256 _mintRatio
    ) public {
        IERC20 paired = IERC20(_paired);
        uint256 _rrTokenAmt = _pairedAmt;
        paired.safeApprove(address(rulerCore), _rrTokenAmt);
        rulerCore.repay(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
        emit RepayFunds(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
    }
    
    function rolloverLoan(
        RolloverData memory _currentLoan,
        RolloverData memory _newLoan
    ) external { 
        require(_currentLoan.pairedAmt <= flashLender.maxFlashLoan(address(_currentLoan.pairedToken)), "RulerFlashBorrower: Insufficient lender reserves");
        _currentLoan.pairedToken.safeTransferFrom(msg.sender, address(this), flashLender.flashFee(address(_currentLoan.pairedToken), _currentLoan.pairedAmt));
        RolloverData[2] memory params = [_currentLoan, _newLoan];
        flashLender.flashLoan(IERC3156FlashBorrower(address(this)), address(_currentLoan.pairedToken), _currentLoan.pairedAmt, abi.encode(params));
    }
    
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data) external returns (bytes32) {
        RolloverData[2] memory params = abi.decode(data, (RolloverData[2]));
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

