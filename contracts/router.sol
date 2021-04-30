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
        uint256 colAmt;
        uint48 expiry;
        uint256 mintRatio;
        address swapPool;
    }

    struct LoanMemory{
        uint256 rcTokenAmt;
        int128 fromIndex;
        int128 toIndex;
        uint256 expectedPairedAmt;
        uint256 resultedPairedAmt;
        uint256 returnToUser;
        uint256 amountOwed;
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

    function depositAndSend(
        address _col,
        address _paired,
        uint256 _colAmt,
        uint48 _expiry,
        uint256 _mintRatio
    ) public {
        IERC20 collateral = IERC20(_col);
        collateral.safeApprove(address(rulerCore), _colAmt);
        rulerCore.deposit(_col, _paired, _expiry, _mintRatio, _colAmt);
        ( , , ,IERC20 rcToken, IERC20 rrToken, , , ) = rulerCore.pairs(_col, _paired, _expiry, _mintRatio);
        rrToken.transfer(address(msg.sender), rrToken.balanceOf(address(this)));
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
      * @param _currentLoan metadata of the curent pair that the user owns debt in.
      * @param _newLoan metadata with the new pair
      */
    function rolloverLoan(
        RolloverData memory _currentLoan,
        RolloverData memory _newLoan
    ) external { 
        require(_currentLoan.pairedAmt <= flashLender.maxFlashLoan(address(_currentLoan.pairedToken)), "RulerFlashBorrower: Insufficient lender reserves");
        console.log("Fee amount: %s", flashLender.flashFee(address(_currentLoan.pairedToken), _currentLoan.pairedAmt));
        RolloverData[2] memory params = [_currentLoan, _newLoan];
        flashLender.flashLoan(IERC3156FlashBorrower(address(this)), address(_currentLoan.pairedToken), _currentLoan.pairedAmt, abi.encode(params));
    }
    
    /** @dev Swap tokens in the metapool
      * @param from info about the token amount and pool
      * @param rcToken rcToken address
      */
    function curveSwap(RolloverData memory from, address rcToken) private returns (uint256){
        (int128 fromIndex, int128 toIndex, ) = curveFactory.get_coin_indices(address(from.swapPool), rcToken, address(from.pairedToken));
        uint256 expectedPairedAmt = ICurvePool(from.swapPool).get_dy(fromIndex, toIndex, from.pairedAmt) * 95 / 10000;
        uint256 resultedPairedAmt = ICurvePool(from.swapPool).exchange_underlying(fromIndex, toIndex, from.pairedAmt, expectedPairedAmt);
        return resultedPairedAmt;
    }
    
    function onFlashLoan(address initiator, address token, uint256 amount, uint256 fee, bytes calldata data) external returns (bytes32) {
        LoanMemory memory loanMem;
        RolloverData[2] memory params = abi.decode(data, (RolloverData[2]));
        RolloverData memory from = params[0];
        RolloverData memory to = params[1];
        require(msg.sender == address(flashLender), "RulerFlashBorrower: Untrusted lender");
        require(initiator == address(this), "RulerFlashBorrower: Untrusted loan initiator");

        ( , , , IERC20 rcToken, IERC20 rrToken, , , ) = rulerCore.pairs(address(from.colToken), address(from.pairedToken), from.expiry, from.mintRatio);
        
        // Get the users rr tokens.
        rrToken.safeTransferFrom(address(from.user), address(this), from.pairedAmt);


        // // Repay the old deposit.         
        repayFunds(address(from.colToken), 
                    address(from.pairedToken), 
                    from.pairedAmt, 
                    from.expiry, 
                    from.mintRatio);
        // // Deposit collateral once again at a later date. 
        depositFunds(address(to.colToken), 
                    address(to.pairedToken), 
                    to.colAmt,
                    to.expiry,
                    to.mintRatio);

        
        loanMem.rcTokenAmt = rcToken.balanceOf(address(this));
        rcToken.approve(from.swapPool, loanMem.rcTokenAmt);
        loanMem.resultedPairedAmt = curveSwap(from, address(rcToken));
     
        loanMem.amountOwed = amount + fee;
        loanMem.returnToUser = loanMem.resultedPairedAmt - fee;
        
        IERC20(token).safeTransferFrom(from.user, address(this), loanMem.amountOwed - IERC20(token).balanceOf(address(this)));
        IERC20(token).approve(address(flashLender), loanMem.amountOwed);
        rrToken.safeTransfer(from.user, from.pairedAmt);
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }   
}

