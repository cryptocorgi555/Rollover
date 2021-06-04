// SPDX-License-Identifier: No License
pragma solidity ^0.8.0;

import "./ERC20/SafeERC20.sol";
import "./interfaces/IRERC20.sol";
import "./interfaces/IERC3156FlashLender.sol";
import "./interfaces/IERC3156FlashBorrower.sol";
import "./interfaces/IRulerCore.sol";
import "./interfaces/ICurvePool.sol";
import "./interfaces/ICurveFactory.sol";
import "./utils/Ownable.sol";
import "hardhat/console.sol";

/** @title Auto Loan Rollover Router. */
contract Router is Ownable{
    using SafeERC20 for IERC20;
    
    struct RolloverData {
        address user;
        address pairedToken;
        uint256 pairedAmt;
        address colToken;
        uint48 expiryOld;
        uint256 mintRatioOld;
        uint48 expiryNew;
        uint256 mintRatioNew;
        address swapPool;
    }

    IRulerCore public rulerCore;
    IERC3156FlashLender public flashLender;
    ICurveFactory public curveFactory;
    
    event DepositFunds(address _addr, address _col, address _paired, uint256 _colAmt, uint48 _expiry, uint256 _mintRatio);
    event RepayFunds(address _col, address _paired, uint48 _expiry, uint256 _mintRatio, uint256 _rrTokenAmt);

    constructor(address _rulerCore, address _curveFactory){
        rulerCore = IRulerCore(_rulerCore);
        flashLender = IERC3156FlashLender(_rulerCore);
        curveFactory = ICurveFactory(_curveFactory);
    }

    /** @dev Deposits the funds on behalf of the user. Keeps the r tokens in itself.
      * @param _col Expects collateral to be in the contract
      * @param _paired Paired Token
      * @param _colAmt Collateral amt 18 points
      * @param _expiry Expiry date
      * @param _mintRatio rr tokens per unit of collateral
      */
    function depositFunds(
        address _col,
        address _paired,
        uint256 _colAmt,
        uint48 _expiry,
        uint256 _mintRatio
    ) public {
        IERC20 collateral = IERC20(_col);
        require(collateral.balanceOf(address(this)) >= _colAmt, "Insufficient collateral balance to deposit funds.");
        collateral.safeApprove(address(rulerCore), _colAmt);
        rulerCore.deposit(_col, _paired, _expiry, _mintRatio, _colAmt);
        emit DepositFunds(address(rulerCore), _col, _paired, _colAmt, _expiry, _mintRatio);
    }
    
    /** @dev Repay the debt of the user.  Expect the rrTokens to be preapproved by the user.
      * @param _col Expects collateral spending to be preapproved
      * @param _paired Paired Token
      * @param _expiry Expiry date
      * @param _mintRatio rr tokens per unit of collateral
      */
    function repayFunds(
        address _col,
        address _paired,
        uint256 _pairedAmt,
        uint48 _expiry,
        uint256 _mintRatio
    ) public {
        IERC20 paired = IERC20(_paired);
        require(paired.balanceOf(address(this)) >= _pairedAmt, "Insufficient paired token amount to repay the laon");
        paired.safeApprove(address(rulerCore), _pairedAmt);
        rulerCore.repay(_col, _paired, _expiry, _mintRatio, _pairedAmt);
        emit RepayFunds(_col, _paired, _expiry, _mintRatio, _pairedAmt);
    }
    
    /** @dev Trigers the rollover process.
      * @param data metadata with the old and new pair 
      */
    function rolloverLoan(
        RolloverData memory data
    ) external { 
        require(data.pairedAmt <= flashLender.maxFlashLoan(address(data.pairedToken)), "RulerFlashBorrower: Insufficient lender reserves");
        flashLender.flashLoan(IERC3156FlashBorrower(address(this)), address(data.pairedToken), data.pairedAmt, abi.encode(data));
    }
    
    /** @dev Swap tokens in the metapool
      * @param swapPool address of the curve metapool
      * @param rcToken rcToken address
      * @param pairedToken token that we want to swap rc tokens for
      * @param swapAmount amount of rc tokens to swap
      */
    function curveSwap(address swapPool, IERC20 rcToken, address pairedToken, uint256 swapAmount) private returns (uint256){
        rcToken.approve(swapPool, swapAmount); // Approve the metapool to spend the rc tokens of the router
        (int128 fromIndex, int128 toIndex, ) = curveFactory.get_coin_indices(address(swapPool), address(rcToken), address(pairedToken));
        uint256 expectedPairedAmt = ICurvePool(swapPool).get_dy(fromIndex, toIndex, swapAmount) * 95 / 10000; // Minimum amoutn of paired we wan to get
        uint256 resultedPairedAmt = ICurvePool(swapPool).exchange_underlying(fromIndex, toIndex, swapAmount, expectedPairedAmt);
        return resultedPairedAmt;
    }
    
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data) external returns (bytes32) {
       
        RolloverData memory params = abi.decode(data, (RolloverData)); 
  
        require(msg.sender == address(flashLender), "RulerFlashBorrower: Untrusted lender");
        require(initiator == address(this), "RulerFlashBorrower: Untrusted loan initiator");

        // Get the new and old rc and rr tokens
        ( , , , , IERC20 rrTokenOld, , , ) = rulerCore.pairs(address(params.colToken), 
                                                                        address(token), 
                                                                        params.expiryOld, params.mintRatioOld);
        ( , , ,IERC20 rcTokenNew, IERC20 rrTokenNew, , , ) = rulerCore.pairs(address(params.colToken), 
                                                                address(token), 
                                                                params.expiryNew, params.mintRatioNew);
        
        // Get the users rr tokens.
        rrTokenOld.safeTransferFrom(address(params.user), address(this), params.pairedAmt);

        uint256 oldColCount = IERC20(params.colToken).balanceOf(address(this));
        // Repay the old deposit.         
        repayFunds(address(params.colToken), 
                    address(token), 
                    params.pairedAmt, 
                    params.expiryOld, 
                    params.mintRatioOld);
        require(rrTokenOld.balanceOf(address(this)) == 0, "Initial loan repayment failed.");
        uint256 colAmt = IERC20(params.colToken).balanceOf(address(this)) - oldColCount;
        require(colAmt > 0, "Did not get collateral after repayment.");
   
        // Deposit collateral once again with a later pair 
        uint256 oldRCCount = rcTokenNew.balanceOf(address(this));
        depositFunds(address(params.colToken), 
                    address(token), 
                    colAmt,
                    params.expiryNew,
                    params.mintRatioNew);
        uint256 rcTokenAmt = rcTokenNew.balanceOf(address(this)) - oldRCCount;
        require(IERC20(params.colToken).balanceOf(address(this)) == oldColCount, "Failed to deposit collateral.");
        require(rcTokenAmt > 0, "Failed to obtain rc tokens");
        require(rrTokenNew.balanceOf(address(this)) == rcTokenAmt, "Failed to obtain rr tokens");
        
        uint256 resultedPairedAmt = curveSwap(params.swapPool, rcTokenNew, params.pairedToken, rcTokenAmt);
        require(resultedPairedAmt > 0, "Failed to swap rc tokens for paired.");
     
        uint256 amountOwed = amount + fee;
        // fees are adopting pulling strategy, Ruler contract will transfer fees
        IERC20(token).approve(address(flashLender), amountOwed);
        //Get the lacking stables from the user. How much we owe minus how much we sold rc for
        IERC20(params.pairedToken).safeTransferFrom(params.user, address(this), amountOwed - resultedPairedAmt);
        rrTokenNew.safeTransfer(params.user, rcTokenAmt);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }   
}

