// SPDX-License-Identifier: No License

pragma solidity ^0.8.0;

interface ICurvePool {
    function coins(uint256 i) external view returns (address);
    function exchange(int128 from, int128 to, uint256 _from_amount, uint256 _min_to_amount) external;
    function exchange_underlying(int128 from, int128 to, uint256 _from_amount, uint256 _min_to_amount) external returns(uint256);
    function get_dy(int128 i, int128 j, uint256 dx) external view returns(uint256);
}