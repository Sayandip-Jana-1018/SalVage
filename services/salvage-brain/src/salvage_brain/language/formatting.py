"""Money rendered from integer paise, never from a float.

Every amount in this system is an integer number of paise, and it stays one all
the way to the string. ``paise / 100`` is a float, and a float is the wrong
type for money: 1999 paise divided by 100 is not 19.99, it is the nearest
double to it, and the moment that value is summed or compared the error is
real. The split below is integer division and a remainder, so nothing is ever
approximated.

Grouping is the Indian convention -- the last three digits, then pairs. That
is not decoration: this text is read by customers in India, and 12,34,567 is
the form they read fluently.
"""

from __future__ import annotations

RUPEE = "₹"


def format_paise_inr(paise: int) -> str:
    """Render integer paise as ``₹12,34,567.89``.

    Negative amounts keep the sign outside the symbol (``-₹5.00``), which is
    how a refund or a reversal should read.
    """
    if not isinstance(paise, int):  # pragma: no cover - defended by typing
        raise TypeError("paise must be an int; money is never a float here")

    sign = "-" if paise < 0 else ""
    magnitude = abs(paise)
    rupees, remainder = divmod(magnitude, 100)
    return f"{sign}{RUPEE}{group_indian(rupees)}.{remainder:02d}"


def group_indian(value: int) -> str:
    """Group an integer the Indian way: ``1234567`` becomes ``12,34,567``."""
    digits = str(value)
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    parts: list[str] = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join([*parts, tail])
