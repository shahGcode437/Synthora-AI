"""Small hand-written value pools for locales Faker does not ship (used only on fallback)."""
from __future__ import annotations

import random
from collections.abc import Callable

Provider = Callable[[random.Random], str]

_PK_MALE = ["Ahmed", "Ali", "Hassan", "Hussain", "Usman", "Bilal", "Hamza", "Imran", "Kamran", "Faisal",
            "Zain", "Talha", "Saad", "Omar", "Danish", "Waqas", "Junaid", "Adnan", "Farhan", "Shahid"]
_PK_FEMALE = ["Ayesha", "Fatima", "Zainab", "Sana", "Hina", "Maryam", "Iqra", "Amna", "Noor", "Sadia",
              "Mahnoor", "Rabia", "Sidra", "Bushra", "Nimra", "Aiman", "Kiran", "Laiba", "Hira", "Saima"]
_PK_LAST = ["Khan", "Ahmed", "Ali", "Malik", "Sheikh", "Butt", "Qureshi", "Siddiqui", "Chaudhry", "Raza",
            "Iqbal", "Hussain", "Mirza", "Javed", "Farooqi", "Ansari", "Baig", "Rana", "Shah", "Nawaz"]
_PK_CITIES = ["Karachi", "Lahore", "Islamabad", "Rawalpindi", "Faisalabad", "Multan", "Peshawar", "Quetta",
              "Sialkot", "Gujranwala", "Hyderabad", "Bahawalpur"]
_PK_BIZ = ["Traders", "Mart", "Enterprises", "Store", "Foods", "Electronics", "Pharmacy", "Bakers", "Textiles", "Services"]
_PK_MOBILE = ["300", "301", "302", "303", "304", "305", "310", "311", "312", "320", "321", "322", "330", "331",
              "333", "334", "340", "345", "346"]


def _first(r: random.Random) -> str:
    return r.choice(_PK_MALE if r.random() < 0.5 else _PK_FEMALE)


PACKS: dict[str, dict[str, Provider]] = {
    "en_PK": {
        "name": lambda r: f"{_first(r)} {r.choice(_PK_LAST)}",
        "first_name": _first,
        "last_name": lambda r: r.choice(_PK_LAST),
        "city": lambda r: r.choice(_PK_CITIES),
        "company": lambda r: f"{r.choice(_PK_LAST)} {r.choice(_PK_BIZ)}",
        "phone_number": lambda r: f"+92 {r.choice(_PK_MOBILE)} {r.randint(0, 9999999):07d}",
    }
}
