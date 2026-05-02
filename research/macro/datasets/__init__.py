"""Loaders for public macro/commodity time series.

Each loader returns a tidy ``pandas.DataFrame`` indexed by date with one
column per series. The fetch step caches under
``research/macro/output/_cache/`` so repeated runs are offline.
"""
from .imf_pink_sheet import fetch_imf_pink_sheet
from .commodities import fetch_brent_monthly, fetch_wti_monthly, fetch_natgas_monthly
from .treasury import fetch_us10y_monthly
from .pwt_sovereign import load_pwt_sovereign
from .statsmodels_macro import load_us_quarterly
from .dxy import fetch_dxy_monthly

__all__ = [
    "fetch_imf_pink_sheet",
    "fetch_brent_monthly",
    "fetch_wti_monthly",
    "fetch_natgas_monthly",
    "fetch_us10y_monthly",
    "load_pwt_sovereign",
    "load_us_quarterly",
    "fetch_dxy_monthly",
]
