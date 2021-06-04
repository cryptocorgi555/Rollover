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
        uint256 _rrTokenAmt = _pairedAmt;
        paired.safeApprove(address(rulerCore), _rrTokenAmt);
        rulerCore.repay(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
        emit RepayFunds(_col, _paired, _expiry, _mintRatio, _rrTokenAmt);
    }
    
    /** @dev Trigers the rollover process.
      * @param _data metadata with the new pair
      */
    function rolloverLoan(
        RolloverData memory _data
    ) external { 
        require(_data.pairedAmt <= flashLender.maxFlashLoan(address(_data.pairedToken)), "RulerFlashBorrower: Insufficient lender reserves");
        console.log("Fee amount: %s", flashLender.flashFee(address(_data.pairedToken), _data.pairedAmt));
        flashLender.flashLoan(IERC3156FlashBorrower(address(this)), address(_data.pairedToken), _data.pairedAmt, abi.encode(_data));
    }
    
    /** @dev Swap tokens in the metapool
      * @param rcToken rcToken address
      */
    function curveSwap(address swapPool, IERC20 rcToken, address pairedToken) private returns (uint256){
        uint256 swapAmount = rcToken.balanceOf(address(this));
        rcToken.approve(swapPool, swapAmount);
        (int128 fromIndex, int128 toIndex, ) = curveFactory.get_coin_indices(address(swapPool), address(rcToken), address(pairedToken));
        uint256 expectedPairedAmt = ICurvePool(swapPool).get_dy(fromIndex, toIndex, swapAmount) * 95 / 10000;
        uint256 resultedPairedAmt = ICurvePool(swapPool).exchange_underlying(fromIndex, toIndex, swapAmount, expectedPairedAmt);
        return resultedPairedAmt;
    }
    
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data) external returns (bytes32) {
       
        RolloverData memory params = abi.decode(data, (RolloverData));
  
        require(msg.sender == address(flashLender), "RulerFlashBorrower: Untrusted lender");
        require(initiator == address(this), "RulerFlashBorrower: Untrusted loan initiator");


        ( , , , , IERC20 rrTokenOld, , , ) = rulerCore.pairs(address(params.colToken), 
                                                                        address(params.pairedToken), 
                                                                        params.expiryOld, params.mintRatioOld);
        ( , , ,IERC20 rcTokenNew, IERC20 rrTokenNew, , , ) = rulerCore.pairs(address(params.colToken), 
                                                                address(params.pairedToken), 
                                                                params.expiryNew, params.mintRatioNew);
        
        // Get the users rr tokens.
        rrTokenOld.safeTransferFrom(address(params.user), address(this), params.pairedAmt);

        // Repay the old deposit.         
        repayFunds(address(params.colToken), 
                    address(params.pairedToken), 
                    params.pairedAmt, 
                    params.expiryOld, 
                    params.mintRatioOld);
        require(rrTokenOld.balanceOf(address(this)) == 0, "Initial loan repayment failed.");
        require(IERC20(params.colToken).balanceOf(address(this)) > 0, "Did not get collateral after repayment.");
        
        // Deposit collateral once again at a later date. 
        depositFunds(address(params.colToken), 
                    address(params.pairedToken), 
                    IERC20(params.colToken).balanceOf(address(this)),
                    params.expiryNew,
                    params.mintRatioNew);

        require(IERC20(params.colToken).balanceOf(address(this)) == 0, "Failed to open new loan.");
        // Require that we have the right EXACT amount of new rr tokens and new rc tokens
        require(rrTokenNew.balanceOf(address(this)) > 0, "Failed to obtain rr tokens");
        require(rcTokenNew.balanceOf(address(this)) > 0, "Failed to obtain rc tokens");
        
        uint256 resultedPairedAmt = curveSwap(params.swapPool, rcTokenNew, params.pairedToken);
        require(IERC20(params.pairedToken).balanceOf(address(this)) > 0, "Failed to swap rc tokens for paired.");
     
        uint256 amountOwed = amount + fee;
        // fees are adopting pulling strategy, Ruler contract will transfer fees
        IERC20(params.pairedToken).approve(address(flashLender), amountOwed);
        
        // loanMem.returnToUser = loanMem.resultedPairedAmt - fee;
        IERC20(token).safeTransferFrom(params.user, address(this), amountOwed - IERC20(params.pairedToken).balanceOf(address(this)));
        rrTokenNew.safeTransfer(params.user, from.pairedAmt);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }   
}

