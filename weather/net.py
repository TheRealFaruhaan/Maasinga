"""Force IPv4 for outgoing requests.

IPv6 connections from this server to some NASA/NOAA hosts hang in SYN-SENT;
curl falls back to IPv4 quickly but Python's urllib waits for the full timeout.
Import this module before making requests.
"""
import socket

_orig = socket.getaddrinfo


def _ipv4_only(host, port, family=0, *args, **kwargs):
    return _orig(host, port, socket.AF_INET, *args, **kwargs)


socket.getaddrinfo = _ipv4_only
