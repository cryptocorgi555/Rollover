// SPDX-License-Identifier: No License

pragma solidity ^0.8.0;

interface ICurveFactory {
    function get_coin_indices(
        address pool, 
        address _from, 
        address _to
    ) external view returns (int128, int128, bool);
}


