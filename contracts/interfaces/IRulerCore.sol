// SPDX-License-Identifier: No License
pragma solidity ^0.8.0;

import "./IRERC20.sol";


struct Pair {
    bool active;
    uint48 expiry;
    address pairedToken;
    IRERC20 rcToken; // ruler capitol token, e.g. RC_Dai_wBTC_2_2021
    IRERC20 rrToken; // ruler repayment token, e.g. RR_Dai_wBTC_2_2021
    uint256 mintRatio; // 1e18, price of collateral / collateralization ratio
    uint256 feeRate; // 1e18
    uint256 colTotal;
}


interface IRulerCore{

    function getPairList(address _col) external view returns (Pair[] memory);
    function deposit(
        address _col,
        address _paired,
        uint48 _expiry,
        uint256 _mintRatio,
        uint256 _colAmt
    ) external;
    
    function repay(
        address _col,
        address _paired,
        uint48 _expiry,
        uint256 _mintRatio,
        uint256 _rrTokenAmt
      ) external;

    function pairs(address _col, address _paired, uint48 _expiry, uint256 _mintRatio) external view returns (
        bool active, 
        uint48 expiry, 
        address pairedToken, 
        IRERC20 rcToken, 
        IRERC20 rrToken, 
        uint256 mintRatio, 
        uint256 feeRate, 
        uint256 colTotal
    );

}