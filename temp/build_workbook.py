"""
Debaloy Flat Owners Welfare Association — FY 2026-27 Workbook Builder
Sheets: Handover | Maintenance | Puja Subscription | Income | Expenses | Withdrawals | Receipts & Payments 2027
"""

import os
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# ── Palette ───────────────────────────────────────────────────────────────────
DARK_BLUE  = "1F4E78"
MED_BLUE   = "4472C4"
CREAM      = "FFF9E6"
BLUE_TEXT  = "0000FF"
WHITE      = "FFFFFF"
GREY       = "BFBFBF"
SUBTEXT    = "595959"
SECTION    = "D9E1F2"
TOTAL_FILL = "D6E4F0"
GREEN_FILL = "E2EFDA"
RED_TEXT   = "C00000"
TEAL       = "1A5276"
EXP_RED    = "922B21"
EXP_SUMM   = "FDECEA"   # light red for expense summary table
INC_GREEN  = "1E6B3C"   # dark green for income sheet
INC_SUMM   = "EAF4EC"   # light green for income summary table
PUJA_COL   = "6B2D8B"   # purple for puja sheet
PUJA_CREAM = "FAF0FF"   # light purple for puja data cells

INR = "#,##0.00"
ARIAL = "Arial"

OWNERS = [
    ("403", "Rajeshree Saha"),
    ("402", "Poushali Deb Barman"),
    ("401", "Somnath NagChoudhury"),
    ("303", "Sayantan Roy"),
    ("302", "Kumar Dey"),
    ("301", "Souren Dutta"),
    ("203", "Goutam Roy"),
    ("202", "Soumen Dutta"),
    ("201", "Pradip Kumar Sinha"),
    ("103", "Sushanta Pal"),
    ("102", "Saikat Sarkar"),
    ("101", "Tulsi Saha"),
    ("G2",  "Tarak Das"),
    ("G1",  "Protima Das"),
]

MONTHS = ["Sep-26","Oct-26","Nov-26","Dec-26","Jan-27","Feb-27",
          "Mar-27","Apr-27","May-27","Jun-27","Jul-27","Aug-27"]

# Income types — these MUST match exactly what the R&P SUMIF uses
# Puja collections are tracked in the dedicated Puja Subscription sheet, not here
INCOME_TYPES = [
    "Special Donation",
    "Bank Interest",
    "Outstanding Dues",
    "Other Income",
]
INCOME_SPARE = 5   # blank rows appended to income summary for future types

# Expense types — these MUST match exactly what the R&P SUMIF uses
EXPENSE_TYPES = [
    "Sweeper's Salary with Bonus",
    "Lift Maintenance Contract Renewal",
    "Electricity Bill",
    "Water Tank Cleaning Charges",
    "Electrical Maintenance",
    "Printing & Stationery",
    "Donation for Durga Puja & Kali Puja",
    "Fire Extinguisher Installation & Refilling",
    "New Water Pump Installation",
    "Septic Tank Cleaning & Other SDDM Charges",
    "General Charges",
    "Miscellaneous Expenses",
    "Building Maintenance",
    "Bank Charges",
    "Other Expenses",
]
EXPENSE_SPARE = 5  # blank rows appended to expense summary for future types

# ── Style helpers ─────────────────────────────────────────────────────────────
def f(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def fnt(bold=False, size=11, color="000000", italic=False):
    return Font(name=ARIAL, size=size, bold=bold, color=color, italic=italic)

def bdr(color=GREY):
    s = Side(style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)

def hdr(ws, ref, val, bg=DARK_BLUE, fg=WHITE, sz=10, align="center"):
    c = ws[ref]
    c.value = val
    c.font  = fnt(bold=True, size=sz, color=fg)
    c.fill  = f(bg)
    c.border = bdr()
    c.alignment = Alignment(horizontal=align, vertical="center")
    return c

def ttl(ws, ref, val, color=DARK_BLUE, sz=14):
    c = ws[ref]
    c.value = val
    c.font  = fnt(bold=True, size=sz, color=color)
    c.alignment = Alignment(horizontal="center", vertical="center")
    return c

def dat(ws, ref, val=None, fmt=INR, bg=CREAM, fg=BLUE_TEXT, bold=False):
    c = ws[ref]
    if val is not None:
        c.value = val
    c.font   = fnt(bold=bold, size=11, color=fg)
    c.fill   = f(bg)
    c.border = bdr()
    c.alignment = Alignment(horizontal="general", vertical="center")
    c.number_format = fmt
    return c

def pln(ws, ref, val=None, bold=False, align="left", color="000000", fmt=None):
    c = ws[ref]
    if val is not None:
        c.value = val
    c.font   = fnt(bold=bold, size=11, color=color)
    c.border = bdr()
    c.alignment = Alignment(horizontal=align, vertical="center")
    if fmt:
        c.number_format = fmt
    return c

def sec(ws, ref, val, bg=SECTION, color=DARK_BLUE):
    c = ws[ref]
    c.value = val
    c.font  = fnt(bold=True, size=11, color=color)
    c.fill  = f(bg)
    c.border = bdr()
    c.alignment = Alignment(horizontal="left", vertical="center")
    return c

def tot(ws, ref, val=None, formula=None, bg=DARK_BLUE, fg=WHITE, fmt=INR):
    c = ws[ref]
    if formula:
        c.value = f"={formula}"
    elif val is not None:
        c.value = val
    c.font   = fnt(bold=True, size=11, color=fg)
    c.fill   = f(bg)
    c.border = bdr()
    c.number_format = fmt
    c.alignment = Alignment(horizontal="center", vertical="center")
    return c

def dv_list(items_or_formula, sqref_str):
    """Return a DataValidation with sqref already set."""
    if isinstance(items_or_formula, list):
        formula = '"' + ",".join(items_or_formula) + '"'
    elif items_or_formula.startswith('"'):
        formula = items_or_formula
    else:
        formula = '"' + items_or_formula + '"'
    dv = DataValidation(type="list", formula1=formula,
                        allow_blank=True, showDropDown=False)
    dv.sqref = sqref_str
    return dv


# ── Sheet 1: Handover ─────────────────────────────────────────────────────────
def build_handover(wb):
    ws = wb.create_sheet("Handover")
    ws.merge_cells("A1:D1"); ttl(ws, "A1", "Debaloy Flat Owners Welfare Association")
    ws.row_dimensions[1].height = 22
    ws.merge_cells("A2:D2")
    ws["A2"].value = "93 Baguiati Road, 3rd Lane & 68 Baguiati Road, 4th Lane, Kolkata – 700028"
    ws["A2"].font  = fnt(size=10, color=SUBTEXT); ws["A2"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A3:D3")
    ws["A3"].value = "Receipts & Payments Account — Financial Year 2024-2026 (ended 31st August)"
    ws["A3"].font  = fnt(bold=True, size=11, color=DARK_BLUE); ws["A3"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A4:D4")
    ws["A4"].value = "This is the original handover record. Do not edit."
    ws["A4"].font  = fnt(bold=True, size=9, color=RED_TEXT); ws["A4"].alignment = Alignment(horizontal="center")

    for col, label in enumerate(["RECEIPTS","Amount (Rs.)","PAYMENTS","Amount (Rs.)"], 1):
        hdr(ws, f"{get_column_letter(col)}6", label, sz=11)

    data = [
        ("Opening Balances", None, "Operating Expenses", None, True, True),
        ("  Bank Balance (Brought Forward)", 198600.14, "  Sweeper Salary & Bonus", 42000.00, False, False),
        ("  Cash Balance (Brought Forward)", 15570.00,  "  Lift Maintenance Renewal (2024-2027)", 27030.00, False, False),
        ("Collections", None, "  Electricity Bill", 49590.00, True, False),
        ("  Maintenance Collection (Bank)", 82520.00, "  Water Tank Cleaning", 5000.00, False, False),
        ("  Maintenance Collection (Cash)", 93780.00, "  Electrical Maintenance", 2340.00, False, False),
        ("  Outstanding - Souren Dutta (Bank)", 3000.00, "  Printing & Stationery", 1972.00, False, False),
        ("Festival & Donations Received", None, "Festival & Event Expenses", None, True, True),
        ("  Durga Puja Collection (Bank)", 2000.00, "  Donation - Durga Puja & Kali Puja", 22500.00, False, False),
        ("  Durga Puja Collection (Cash)", 12000.00, "Infrastructure & Safety", None, False, True),
        ("  Special Donation - Mr. K. Dey", 1000.00, "  Fire Extinguisher Install & Refilling", 2600.00, False, False),
        ("Other Income", None, "  New Water Pump Installation", 19020.00, True, False),
        ("  Bank Interest Earned", 11216.00, "  Septic Tank Cleaning & Others (SDDM)", 10490.00, False, False),
        (None, None, "Miscellaneous", None, False, True),
        (None, None, "  General Charges", 4614.00, False, False),
        (None, None, "  Miscellaneous Expenses", 250.00, False, False),
        (None, None, "  Building Maintenance", 1300.00, False, False),
        (None, None, "  Bank Charges", 155.24, False, False),
        (None, None, "Closing Balances", None, False, True),
        (None, None, "  Cash in Hand", 1364.00, False, False),
        (None, None, "  Cash in Bank", 229460.90, False, False),
    ]
    for i, (av, bv, cv, dv, a_sec, c_sec) in enumerate(data, 7):
        if av:
            sec(ws, f"A{i}", av) if a_sec else pln(ws, f"A{i}", av)
        else:
            ws[f"A{i}"].border = bdr()
        if bv is not None:
            pln(ws, f"B{i}", bv, fmt=INR, align="right")
        else:
            c = ws[f"B{i}"]
            c.fill = f(SECTION) if a_sec else f(WHITE)
            c.border = bdr()
        if cv:
            sec(ws, f"C{i}", cv) if c_sec else pln(ws, f"C{i}", cv)
        else:
            ws[f"C{i}"].border = bdr()
        if dv is not None:
            pln(ws, f"D{i}", dv, fmt=INR, align="right")
        else:
            c = ws[f"D{i}"]
            c.fill = f(SECTION) if c_sec else f(WHITE)
            c.border = bdr()

    last = 7 + len(data)
    tot(ws, f"A{last}", val="TOTAL", fmt="General")
    tot(ws, f"B{last}", formula="B8+B9+B11+B12+B13+B15+B16+B17+B19+B20+B21+B23")
    tot(ws, f"C{last}", val="TOTAL", fmt="General")
    tot(ws, f"D{last}", formula="D8+D9+D10+D11+D12+D13+D15+D16+D17+D18+D19+D20+D21+D22+D23+D24+D25+D26+D27")

    r = last + 2
    for label, val in [("Closing Bank Balance to FY 2026-27:", 229460.90),
                        ("Closing Cash Balance to FY 2026-27:", 1364.00)]:
        ws[f"A{r}"].value = label; ws[f"A{r}"].font = fnt(bold=True, color=DARK_BLUE)
        ws[f"B{r}"].value = val;   ws[f"B{r}"].font = fnt(bold=True, color=DARK_BLUE)
        ws[f"B{r}"].number_format = INR
        r += 1

    ws.column_dimensions["A"].width = 38
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 42
    ws.column_dimensions["D"].width = 16


# ── Sheet 2: Maintenance ──────────────────────────────────────────────────────
# Layout: A=Flat, B=Resident, then per month 2 cols: Amt + Mode (C/D, E/F, … Y/Z)
# AA=Total Bank (SUMPRODUCT), AB=Total Cash (SUMPRODUCT), AC=Grand Total
# Mode cells pre-filled "Cash"; dropdown Bank/Cash.
def build_maintenance(wb):
    ws = wb.create_sheet("Maintenance")
    ws.merge_cells("A1:AC1"); ttl(ws, "A1", "Debaloy Flat Owners Welfare Association")
    ws.row_dimensions[1].height = 22
    ws.merge_cells("A2:AC2")
    ws["A2"].value = "Maintenance Collection Tracker  |  Sept 2026 to Aug 2027"
    ws["A2"].font  = fnt(bold=True, size=12, color=DARK_BLUE)
    ws["A2"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A3:AC3")
    ws["A3"].value = ("Enter amount and select mode (Bank/Cash) for each month. "
                      "Mode defaults to Cash. Blank = not recorded. "
                      "0 = payment not required (paid in advance, or paid some operating expenses for the society, etc.).")
    ws["A3"].font  = fnt(size=9, color=SUBTEXT, italic=True)
    ws["A3"].alignment = Alignment(horizontal="center")

    # ── Column layout: A=Flat, B=Resident, then 12 months × 2 cols each ──
    # Month mi → Amt col = 3 + mi*2, Mode col = 4 + mi*2
    amt_mode_cols = []   # list of (amt_letter, mode_letter)
    for mi, month in enumerate(MONTHS):
        ac = get_column_letter(3 + mi * 2)      # C, E, G, ...
        mc = get_column_letter(3 + mi * 2 + 1)  # D, F, H, ...
        amt_mode_cols.append((ac, mc))

    # ── Row 5: Flat/Resident headers + month name merged over Amt+Mode ──
    hdr(ws, "A5", "Flat",  sz=10); hdr(ws, "A6", "",    sz=10); ws.merge_cells("A5:A6")
    hdr(ws, "B5", "Resident", sz=10); hdr(ws, "B6", "",    sz=10); ws.merge_cells("B5:B6")

    for (ac, mc), month in zip(amt_mode_cols, MONTHS):
        hdr(ws, f"{ac}5", month, sz=10)
        hdr(ws, f"{mc}5", month, sz=10)          # style before merge
        ws.merge_cells(f"{ac}5:{mc}5")
        hdr(ws, f"{ac}6", "Amount (Rs.)", bg=MED_BLUE, sz=9)
        hdr(ws, f"{mc}6", "Mode",         bg=MED_BLUE, sz=9)

    # ── Total column headers ──
    hdr(ws, "AA5", "Total Bank", sz=10); hdr(ws, "AA6", "", sz=10); ws.merge_cells("AA5:AA6")
    hdr(ws, "AB5", "Total Cash", sz=10); hdr(ws, "AB6", "", sz=10); ws.merge_cells("AB5:AB6")
    hdr(ws, "AC5", "Total",      sz=10); hdr(ws, "AC6", "", sz=10); ws.merge_cells("AC5:AC6")
    ws.row_dimensions[5].height = 18
    ws.row_dimensions[6].height = 16

    # ── Data rows 7–20 ──
    all_amt_cols  = [ac for ac, _ in amt_mode_cols]   # C,E,G,...,Y
    all_mode_cols = [mc for _, mc in amt_mode_cols]   # D,F,H,...,Z

    for ri, (flat, owner) in enumerate(OWNERS, 7):
        pln(ws, f"A{ri}", flat,  align="center")
        pln(ws, f"B{ri}", owner, align="left")

        for ac, mc in amt_mode_cols:
            # Amount cell
            dat(ws, f"{ac}{ri}", fmt=INR)
            # Mode cell — pre-fill "Cash", cream background, blue text
            c = ws[f"{mc}{ri}"]
            c.value  = "Cash"
            c.font   = fnt(size=10, color=BLUE_TEXT)
            c.fill   = f(CREAM)
            c.border = bdr()
            c.alignment = Alignment(horizontal="center", vertical="center")

        # Per-row Bank/Cash totals via SUMPRODUCT
        # SUMPRODUCT((mode_range="Bank")*amt_range) for this row
        amt_range  = ",".join(f"{ac}{ri}" for ac in all_amt_cols)
        mode_range = ",".join(f"{mc}{ri}" for mc in all_mode_cols)

        # Build arrays manually for SUMPRODUCT across non-contiguous cells:
        # =SUMPRODUCT((D7="Bank")*(C7)+(F7="Bank")*(E7)+...)
        bank_terms = "+".join(
            f'({mc}{ri}="Bank")*{ac}{ri}' for ac, mc in amt_mode_cols
        )
        cash_terms = "+".join(
            f'({mc}{ri}="Cash")*{ac}{ri}' for ac, mc in amt_mode_cols
        )

        c_bank = ws[f"AA{ri}"]
        c_bank.value  = f"={bank_terms}"
        c_bank.font   = fnt(bold=True, size=11, color=DARK_BLUE)
        c_bank.fill   = f(TOTAL_FILL)
        c_bank.border = bdr()
        c_bank.number_format = INR
        c_bank.alignment = Alignment(horizontal="right", vertical="center")

        c_cash = ws[f"AB{ri}"]
        c_cash.value  = f"={cash_terms}"
        c_cash.font   = fnt(bold=True, size=11, color=DARK_BLUE)
        c_cash.fill   = f(TOTAL_FILL)
        c_cash.border = bdr()
        c_cash.number_format = INR
        c_cash.alignment = Alignment(horizontal="right", vertical="center")

        pln(ws, f"AC{ri}", bold=True, fmt=INR).value = f"=AA{ri}+AB{ri}"

    # ── Grand total row 22 ──
    r = 22
    hdr(ws, f"B{r}", "", bg=DARK_BLUE)   # style B before merge
    tot(ws, f"A{r}", val="Grand Total", fmt="General")
    ws.merge_cells(f"A{r}:B{r}")
    for ac, mc in amt_mode_cols:
        tot(ws, f"{ac}{r}", formula=f"SUM({ac}7:{ac}20)")
        # Mode col in total row — blank, styled
        c = ws[f"{mc}{r}"]
        c.fill = f(DARK_BLUE); c.border = bdr()
    tot(ws, f"AA{r}", formula="SUM(AA7:AA20)")
    tot(ws, f"AB{r}", formula="SUM(AB7:AB20)")
    tot(ws, f"AC{r}", formula="SUM(AC7:AC20)")

    # ── DataValidation: Mode dropdown Bank/Cash on all mode cells ──
    mode_sqref = " ".join(f"{mc}7:{mc}20" for _, mc in amt_mode_cols)
    dv_mode = dv_list('"Bank,Cash"', mode_sqref)
    ws.add_data_validation(dv_mode)

    # ── Column widths ──
    ws.column_dimensions["A"].width = 7
    ws.column_dimensions["B"].width = 22
    for ac, mc in amt_mode_cols:
        ws.column_dimensions[ac].width = 12
        ws.column_dimensions[mc].width = 8
    ws.column_dimensions["AA"].width = 13
    ws.column_dimensions["AB"].width = 13
    ws.column_dimensions["AC"].width = 13
    ws.freeze_panes = "C7"


# ── Sheet 3: Puja Subscription ────────────────────────────────────────────────
# Cash only — one payment per flat per year.
# Puja!C{total_row} = SUM of all amounts → feeds R&P.
def build_puja(wb):
    ws = wb.create_sheet("Puja Subscription")

    ws.merge_cells("A1:C1")
    ttl(ws, "A1", "Debaloy — Puja Subscription FY 2026-27", color=PUJA_COL, sz=12)
    ws.row_dimensions[1].height = 22

    ws.merge_cells("A2:C2")
    ws["A2"].value = "Cash only — one payment per flat. Total auto-feeds Receipts & Payments."
    ws["A2"].font = fnt(size=9, color=SUBTEXT, italic=True)
    ws["A2"].alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[2].height = 18

    ws.merge_cells("A3:C3")
    ws["A3"].value = "FY 2026-27  |  Sept 2026 – Aug 2027  |  Cash Only"
    ws["A3"].font = fnt(bold=True, size=10, color=PUJA_COL)
    ws["A3"].alignment = Alignment(horizontal="center")

    for col, label in enumerate(["Flat", "Resident", "Amount (Rs.)"], 1):
        hdr(ws, f"{get_column_letter(col)}5", label, bg=PUJA_COL, sz=10)

    for ri, (flat, owner) in enumerate(OWNERS, 6):
        pln(ws, f"A{ri}", flat,  align="center")
        pln(ws, f"B{ri}", owner, align="left")
        c = ws[f"C{ri}"]
        c.fill = f(PUJA_CREAM); c.border = bdr()
        c.font = fnt(size=11, color=BLUE_TEXT)
        c.number_format = INR
        c.alignment = Alignment(horizontal="general", vertical="center")

    # Grand total row (cash only)
    r = 6 + len(OWNERS)   # row 20
    hdr(ws, f"B{r}", "", bg=PUJA_COL)
    tot(ws, f"A{r}", val="Grand Total (Cash)", fmt="General")
    ws.merge_cells(f"A{r}:B{r}")

    c_tot = ws[f"C{r}"]
    c_tot.value = f"=SUM(C6:C{r-1})"
    c_tot.font = fnt(bold=True, size=11, color=WHITE)
    c_tot.fill = f(PUJA_COL); c_tot.border = bdr()
    c_tot.number_format = INR
    c_tot.alignment = Alignment(horizontal="right", vertical="center")

    ws.column_dimensions["A"].width = 7
    ws.column_dimensions["B"].width = 26
    ws.column_dimensions["C"].width = 16


# ── Sheet 4: Income (date log + right-side SUMIF summary) ────────────────────
def build_income(wb):
    ws = wb.create_sheet("Income")

    # Title
    ws.merge_cells("A1:G1")
    ttl(ws, "A1", "Debaloy Flat Owners Welfare Association — Income Tracker", color=INC_GREEN, sz=12)
    ws.row_dimensions[1].height = 20

    ws.merge_cells("A2:G2")
    ws["A2"].value = ("Add every receipt here with date, income type and amount. "
                      "Each type auto-totals on the right and flows into the Receipts & Payments report.")
    ws["A2"].font = fnt(size=9, color=SUBTEXT, italic=True)
    ws["A2"].alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[2].height = 24

    # Log table headers (A–E)
    for col, label in enumerate(["Date", "Income Type", "Description", "Mode", "Amount (Rs.)"], 1):
        hdr(ws, f"{get_column_letter(col)}4", label, bg=INC_GREEN, sz=10)

    # Summary table headers (G–H merged, I), separated by blank col F
    hdr(ws, "G4", "Category Summary (auto)", bg=INC_GREEN, sz=10)
    hdr(ws, "H4", "", bg=INC_GREEN, sz=10)
    ws.merge_cells("G4:H4")
    hdr(ws, "I4", "Total Received (Rs.)", bg=INC_GREEN, sz=10)

    # ── Summary rows — fixed income types ──
    def _inc_summary_row(ws, si, label=None):
        """Write one income summary row. label=None = blank spare row."""
        ws[f"H{si}"].fill = f(INC_SUMM); ws[f"H{si}"].border = bdr()
        c = ws[f"G{si}"]
        c.value = label
        c.font  = fnt(size=10, bold=(label is not None), color=INC_GREEN)
        c.fill  = f(INC_SUMM)
        c.border = bdr()
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.merge_cells(f"G{si}:H{si}")
        tc = ws[f"I{si}"]
        tc.value  = f'=IF(G{si}="","",SUMIF(B5:B1004,G{si},E5:E1004))'
        tc.font   = fnt(size=11, bold=True, color=DARK_BLUE)
        tc.fill   = f(TOTAL_FILL)
        tc.border = bdr()
        tc.number_format = INR
        tc.alignment = Alignment(horizontal="right", vertical="center")

    for si, itype in enumerate(INCOME_TYPES, 5):
        _inc_summary_row(ws, si, itype)

    # ── Spare rows (blank) — just type a name in G to activate ──
    first_spare_inc = 5 + len(INCOME_TYPES)
    for si in range(first_spare_inc, first_spare_inc + INCOME_SPARE):
        _inc_summary_row(ws, si, None)

    # ── Grand total ──
    grand_row = first_spare_inc + INCOME_SPARE
    hdr(ws, f"H{grand_row}", "", bg=INC_GREEN, sz=10)
    hdr(ws, f"G{grand_row}", "TOTAL INCOME", bg=INC_GREEN, sz=10, align="right")
    ws.merge_cells(f"G{grand_row}:H{grand_row}")
    tot(ws, f"I{grand_row}", formula=f"SUM(I5:I{grand_row-1})")

    # ── Log rows (1000 rows so SUMIF above covers them all) ──
    for r in range(5, 1005):
        c = ws[f"A{r}"]
        c.border = bdr()
        c.number_format = "DD-MMM-YYYY"
        c.fill = f(CREAM)
        c.font = fnt(size=11, color=BLUE_TEXT)
        for col in ["B", "C", "D", "E"]:
            lc = ws[f"{col}{r}"]
            lc.fill = f(CREAM)
            lc.border = bdr()
            lc.font = fnt(size=11, color=BLUE_TEXT)
        ws[f"E{r}"].number_format = INR

    # ── DataValidation: dropdown reads live from the summary G column ──
    # Covers fixed types + spare rows — adding a name in G auto-adds it to dropdown
    last_type_row = grand_row - 1
    dv_type = dv_list(f"Income!$G$5:$G${last_type_row}", "B5:B1004")
    dv_mode = dv_list('"Bank,Cash"', "D5:D1004")
    ws.add_data_validation(dv_type)
    ws.add_data_validation(dv_mode)

    ws.column_dimensions["A"].width = 13
    ws.column_dimensions["B"].width = 30
    ws.column_dimensions["C"].width = 28
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 14
    ws.column_dimensions["F"].width = 3   # gap
    ws.column_dimensions["G"].width = 30
    ws.column_dimensions["H"].width = 2
    ws.column_dimensions["I"].width = 18
    ws.freeze_panes = "A5"


# ── Sheet 4: Expenses (date log + right-side SUMIF summary) ──────────────────
def build_expenses(wb):
    ws = wb.create_sheet("Expenses")

    # Title
    ws.merge_cells("A1:G1")
    ttl(ws, "A1", "Debaloy Flat Owners Welfare Association — Expense Tracker", color=EXP_RED, sz=12)
    ws.row_dimensions[1].height = 20

    ws.merge_cells("A2:G2")
    ws["A2"].value = ("Add every expense here with date, type and amount. "
                      "Each type auto-totals below and flows into the Receipts & Payments report.")
    ws["A2"].font = fnt(size=9, color=SUBTEXT, italic=True)
    ws["A2"].alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[2].height = 24

    # Log table headers (A–E)
    for col, label in enumerate(["Date", "Expense Type", "Description", "Mode", "Amount (Rs.)"], 1):
        hdr(ws, f"{get_column_letter(col)}4", label, bg=EXP_RED, sz=10)

    # Summary table headers (G–H merged, I), separated by blank col F
    hdr(ws, "G4", "Category Summary (auto)", bg=EXP_RED, sz=10)
    hdr(ws, "H4", "", bg=EXP_RED, sz=10)
    ws.merge_cells("G4:H4")
    hdr(ws, "I4", "Total Spent (Rs.)", bg=EXP_RED, sz=10)

    # ── Summary rows — fixed expense types ──
    def _exp_summary_row(ws, si, label=None):
        """Write one expense summary row. label=None = blank spare row."""
        ws[f"H{si}"].fill = f(EXP_SUMM); ws[f"H{si}"].border = bdr()
        c = ws[f"G{si}"]
        c.value = label
        c.font  = fnt(size=10, bold=(label is not None), color=EXP_RED)
        c.fill  = f(EXP_SUMM)
        c.border = bdr()
        c.alignment = Alignment(horizontal="left", vertical="center")
        ws.merge_cells(f"G{si}:H{si}")
        tc = ws[f"I{si}"]
        tc.value  = f'=IF(G{si}="","",SUMIF(B5:B1004,G{si},E5:E1004))'
        tc.font   = fnt(size=11, bold=True, color=DARK_BLUE)
        tc.fill   = f(TOTAL_FILL)
        tc.border = bdr()
        tc.number_format = INR
        tc.alignment = Alignment(horizontal="right", vertical="center")

    for si, etype in enumerate(EXPENSE_TYPES, 5):
        _exp_summary_row(ws, si, etype)

    # ── Spare rows (blank) — just type a name in G to activate ──
    first_spare_exp = 5 + len(EXPENSE_TYPES)
    for si in range(first_spare_exp, first_spare_exp + EXPENSE_SPARE):
        _exp_summary_row(ws, si, None)

    # ── Grand total ──
    grand_row = first_spare_exp + EXPENSE_SPARE
    hdr(ws, f"H{grand_row}", "", bg=EXP_RED, sz=10)
    hdr(ws, f"G{grand_row}", "TOTAL EXPENSES", bg=EXP_RED, sz=10, align="right")
    ws.merge_cells(f"G{grand_row}:H{grand_row}")
    tot(ws, f"I{grand_row}", formula=f"SUM(I5:I{grand_row-1})")

    # ── Log rows (1000 rows so SUMIF above covers them all) ──
    for r in range(5, 1005):
        c = ws[f"A{r}"]
        c.border = bdr()
        c.number_format = "DD-MMM-YYYY"
        c.fill = f(CREAM)
        c.font = fnt(size=11, color=BLUE_TEXT)
        for col in ["B", "C", "D", "E"]:
            lc = ws[f"{col}{r}"]
            lc.fill = f(CREAM)
            lc.border = bdr()
            lc.font = fnt(size=11, color=BLUE_TEXT)
        ws[f"E{r}"].number_format = INR

    # ── DataValidation: dropdown reads live from the summary G column ──
    # Covers fixed types + spare rows — adding a name in G auto-adds it to dropdown
    last_type_row = grand_row - 1
    dv_type = dv_list(f"Expenses!$G$5:$G${last_type_row}", "B5:B1004")
    dv_mode = dv_list('"Bank,Cash"', "D5:D1004")
    ws.add_data_validation(dv_type)
    ws.add_data_validation(dv_mode)

    ws.column_dimensions["A"].width = 13
    ws.column_dimensions["B"].width = 36
    ws.column_dimensions["C"].width = 28
    ws.column_dimensions["D"].width = 12
    ws.column_dimensions["E"].width = 14
    ws.column_dimensions["F"].width = 3   # gap
    ws.column_dimensions["G"].width = 36
    ws.column_dimensions["H"].width = 2
    ws.column_dimensions["I"].width = 18
    ws.freeze_panes = "A5"


# ── Sheet 5: Withdrawals (bank to cash in hand) ───────────────────────────────
def build_withdrawals(wb):
    ws = wb.create_sheet("Withdrawals")

    ws.merge_cells("A1:C1")
    ttl(ws, "A1", "Debaloy Flat Owners Welfare Association — Withdrawals Tracker", color=TEAL, sz=12)
    ws.row_dimensions[1].height = 20

    ws.merge_cells("A2:C2")
    ws["A2"].value = (
        "Cash taken out of the bank. Increases cash in hand and decreases cash in bank "
        "by the same amount. Not a Receipts & Payments line."
    )
    ws["A2"].font = fnt(size=9, color=SUBTEXT, italic=True)
    ws["A2"].alignment = Alignment(horizontal="center", wrap_text=True)
    ws.row_dimensions[2].height = 24

    for col, label in enumerate(["Date", "Amount (Rs.)", "Note"], 1):
        hdr(ws, f"{get_column_letter(col)}4", label, bg=TEAL, sz=10)

    for r in range(5, 25):
        c = ws[f"A{r}"]
        c.border = bdr()
        c.number_format = "DD-MMM-YYYY"
        c.fill = f(CREAM)
        c.font = fnt(size=11, color=BLUE_TEXT)
        amt = ws[f"B{r}"]
        amt.fill = f(CREAM)
        amt.border = bdr()
        amt.font = fnt(size=11, color=BLUE_TEXT)
        amt.number_format = INR
        note = ws[f"C{r}"]
        note.fill = f(CREAM)
        note.border = bdr()
        note.font = fnt(size=11, color=BLUE_TEXT)

    tot_row = 25
    tot(ws, f"A{tot_row}", val="Total withdrawn", fmt="General")
    tot(ws, f"B{tot_row}", formula="SUM(B5:B24)")
    hdr(ws, f"C{tot_row}", "", bg=TEAL)

    ws.column_dimensions["A"].width = 13
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 42
    ws.freeze_panes = "A5"


# ── Sheet 6: Receipts & Payments 2027 ────────────────────────────────────────
def build_rp(wb):
    ws = wb.create_sheet("Receipts & Payments 2027")
    ws.merge_cells("A1:D1"); ttl(ws, "A1", "Debaloy Flat Owners Welfare Association")
    ws.row_dimensions[1].height = 22
    ws.merge_cells("A2:D2")
    ws["A2"].value = "93 Baguiati Road, 3rd Lane & 68 Baguiati Road, 4th Lane, Kolkata – 700028"
    ws["A2"].font = fnt(size=10, color=SUBTEXT); ws["A2"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A3:D3")
    ws["A3"].value = "Receipts & Payments Account — Financial Year 2026-2027 (September 2026 to August 2027)"
    ws["A3"].font = fnt(bold=True, size=11, color=DARK_BLUE); ws["A3"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A4:D4")
    ws["A4"].value = "All receipt and expense totals are auto-pulled from the Income and Expenses sheets."
    ws["A4"].font = fnt(size=9, color=RED_TEXT, italic=True); ws["A4"].alignment = Alignment(horizontal="center")

    for col, label in enumerate(["RECEIPTS", "Amount (Rs.)", "PAYMENTS", "Amount (Rs.)"], 1):
        hdr(ws, f"{get_column_letter(col)}6", label, sz=11)

    # Helper: SUMIF against Income sheet
    def sumif_inc(cat):
        return f'SUMIF(Income!B5:B1004,"{cat}",Income!E5:E1004)'

    # Helper: SUMIF against Expenses sheet
    def sumif_exp(cat):
        return f'SUMIF(Expenses!B5:B1004,"{cat}",Expenses!E5:E1004)'

    # Helper to write one full row
    def rp_row(r, a, b, c, d, a_linked=False, b_formula=False, d_formula=False,
               c_bold=False, c_bg=None, c_color="000000"):
        ca = ws[f"A{r}"]
        ca.value = a; ca.border = bdr()
        ca.font  = fnt(size=11, color=(DARK_BLUE if a_linked else "000000"))
        ca.alignment = Alignment(horizontal="left", vertical="center")

        cb = ws[f"B{r}"]
        cb.value = f"={b}" if b_formula else b
        cb.font   = fnt(size=11, bold=b_formula, color=(DARK_BLUE if a_linked else "000000"))
        cb.fill   = f(TOTAL_FILL if a_linked else WHITE)
        cb.border = bdr(); cb.number_format = INR
        cb.alignment = Alignment(horizontal="right", vertical="center")

        cc = ws[f"C{r}"]
        cc.value = c; cc.border = bdr()
        cc.font  = fnt(size=11, bold=c_bold, color=c_color)
        if c_bg:
            cc.fill = f(c_bg)
        cc.alignment = Alignment(horizontal="left", vertical="center")

        cd = ws[f"D{r}"]
        cd.value = f"={d}" if d_formula else d
        cd.font  = fnt(size=11, color="000000")
        cd.fill  = f(TOTAL_FILL if d_formula else WHITE)
        cd.border = bdr(); cd.number_format = INR
        cd.alignment = Alignment(horizontal="right", vertical="center")

    # ── RECEIPTS side ──────────────────────────────────────────────────────────
    sec(ws, "A7", "Opening Balances")
    ws["B7"].fill = f(SECTION); ws["B7"].border = bdr()

    rp_row(8,  "  Bank Balance (Brought Forward)", "Handover!D27",
               "  Sweeper's Salary with Bonus",    sumif_exp("Sweeper's Salary with Bonus"),
               a_linked=True, b_formula=True, d_formula=True)
    rp_row(9,  "  Cash Balance (Brought Forward)", "Handover!D26",
               "  Lift Maintenance Contract Renewal", sumif_exp("Lift Maintenance Contract Renewal"),
               a_linked=True, b_formula=True, d_formula=True)

    sec(ws, "A10", "Maintenance")
    ws["B10"].fill = f(SECTION); ws["B10"].border = bdr()
    sec(ws, "C7", "Operating Expenses")
    ws["D7"].fill = f(SECTION); ws["D7"].border = bdr()

    rp_row(11, "  Maintenance (Bank)", "Maintenance!AA22",
               "  Electricity Bill",   sumif_exp("Electricity Bill"),
               a_linked=True, b_formula=True, d_formula=True)
    rp_row(12, "  Maintenance (Cash)", "Maintenance!AB22",
               "  Water Tank Cleaning Charges", sumif_exp("Water Tank Cleaning Charges"),
               a_linked=True, b_formula=True, d_formula=True)

    # ── Puja & Festival Collections ──────────────────────────────────────────
    # Grand total row in Puja sheet = row (6 + len(OWNERS)) = 20
    puja_total_row = 6 + len(OWNERS)   # = 20
    sec(ws, "A13", "Puja & Festival Collections")
    ws["B13"].fill = f(SECTION); ws["B13"].border = bdr()
    sec(ws, "C10", "  Electrical Maintenance")
    ws["D10"].value = f"={sumif_exp('Electrical Maintenance')}"; ws["D10"].number_format = INR
    ws["D10"].font = fnt(size=11); ws["D10"].fill = f(TOTAL_FILL)
    ws["D10"].border = bdr()
    ws["D10"].alignment = Alignment(horizontal="right", vertical="center")

    # Row 14: flat owners' puja subscription — cash total from Puja sheet
    rp_row(14, "  Puja Subscription (residents)",
               f"'Puja Subscription'!C{puja_total_row}",
               "  Printing & Stationery", sumif_exp("Printing & Stationery"),
               a_linked=True, b_formula=True, d_formula=True)

    # Row 15: external special donation — cash from Income sheet
    rp_row(15, "  Special Donation (external)",
               sumif_inc("Special Donation"),
               "  Donation - Durga Puja & Kali Puja", sumif_exp("Donation for Durga Puja & Kali Puja"),
               a_linked=True, b_formula=True, d_formula=True)

    # ── Other Income ─────────────────────────────────────────────────────────
    sec(ws, "A16", "Other Income")
    ws["B16"].fill = f(SECTION); ws["B16"].border = bdr()
    sec(ws, "C13", "Infrastructure & Safety")
    ws["D13"].fill = f(SECTION); ws["D13"].border = bdr()

    rp_row(17, "  Bank Interest",    sumif_inc("Bank Interest"),
               "  Fire Extinguisher Install & Refilling", sumif_exp("Fire Extinguisher Installation & Refilling"),
               a_linked=True, b_formula=True, d_formula=True)
    rp_row(18, "  Outstanding Dues", sumif_inc("Outstanding Dues"),
               "  New Water Pump Installation", sumif_exp("New Water Pump Installation"),
               a_linked=True, b_formula=True, d_formula=True)
    rp_row(19, "  Other Income",     sumif_inc("Other Income"),
               "  Septic Tank Cleaning & SDDM", sumif_exp("Septic Tank Cleaning & Other SDDM Charges"),
               a_linked=True, b_formula=True, d_formula=True)

    # Row 20 blank border holders (income spares start at 20)
    ws["C20"].border = bdr(); ws["D20"].border = bdr()
    ws["A20"].border = bdr(); ws["B20"].border = bdr()

    # ── Income spare rows (20–24): reference Income!G column live ──
    inc_spare_start_g = 5 + len(INCOME_TYPES)   # row in Income sheet G column
    for i in range(INCOME_SPARE):
        rp_ri  = 20 + i
        inc_gi = inc_spare_start_g + i
        ca = ws[f"A{rp_ri}"]
        ca.value = f"=IF(Income!G{inc_gi}=\"\",\"\",\"  \"&Income!G{inc_gi})"
        ca.font  = fnt(size=11, color=DARK_BLUE, italic=True)
        ca.border = bdr()
        ca.alignment = Alignment(horizontal="left", vertical="center")
        cb = ws[f"B{rp_ri}"]
        cb.value = (f'=IF(Income!G{inc_gi}=""," ",'
                    f'SUMIF(Income!B5:B1004,Income!G{inc_gi},Income!E5:E1004))')
        cb.font  = fnt(size=11, bold=True, color=DARK_BLUE)
        cb.fill  = f(TOTAL_FILL); cb.border = bdr()
        cb.number_format = INR
        cb.alignment = Alignment(horizontal="right", vertical="center")
        ws[f"C{rp_ri}"].border = bdr()
        ws[f"D{rp_ri}"].border = bdr()

    # ── Fixed expense rows start after income spare rows ──
    exp_start = 20 + INCOME_SPARE   # = 25

    sec(ws, "C14", "Miscellaneous")
    ws["D14"].fill = f(SECTION); ws["D14"].border = bdr()

    misc = [
        (exp_start,     "  General Charges",        "General Charges"),
        (exp_start + 1, "  Miscellaneous Expenses",  "Miscellaneous Expenses"),
        (exp_start + 2, "  Building Maintenance",    "Building Maintenance"),
        (exp_start + 3, "  Bank Charges",            "Bank Charges"),
        (exp_start + 4, "  Other Expenses",          "Other Expenses"),
    ]
    for ri, label, cat in misc:
        ws[f"A{ri}"].border = bdr(); ws[f"B{ri}"].border = bdr()
        pln(ws, f"C{ri}", label)
        cd = ws[f"D{ri}"]
        cd.value = f"={sumif_exp(cat)}"
        cd.font  = fnt(size=11); cd.fill = f(TOTAL_FILL)
        cd.border = bdr(); cd.number_format = INR
        cd.alignment = Alignment(horizontal="right", vertical="center")

    # ── Expense spare rows: reference Expenses!G column live ──
    # Expense summary spare rows start at row (5 + len(EXPENSE_TYPES)) = 20 in Expenses sheet
    exp_spare_row_start = exp_start + 5    # R&P row after the 5 fixed misc rows
    exp_spare_start_g   = 5 + len(EXPENSE_TYPES)   # row in Expenses sheet G column
    for i in range(EXPENSE_SPARE):
        rp_ri  = exp_spare_row_start + i
        exp_gi = exp_spare_start_g + i
        ws[f"A{rp_ri}"].border = bdr(); ws[f"B{rp_ri}"].border = bdr()
        cc = ws[f"C{rp_ri}"]
        cc.value = f"=IF(Expenses!G{exp_gi}=\"\",\"\",\"  \"&Expenses!G{exp_gi})"
        cc.font  = fnt(size=11, color="000000", italic=True)
        cc.border = bdr()
        cc.alignment = Alignment(horizontal="left", vertical="center")
        cd = ws[f"D{rp_ri}"]
        cd.value = (f'=IF(Expenses!G{exp_gi}=""," ",'
                    f'SUMIF(Expenses!B5:B1004,Expenses!G{exp_gi},Expenses!E5:E1004))')
        cd.font  = fnt(size=11); cd.fill = f(TOTAL_FILL)
        cd.border = bdr(); cd.number_format = INR
        cd.alignment = Alignment(horizontal="right", vertical="center")

    # ── Closing Balances, TOTAL ──
    closing_row  = exp_spare_row_start + EXPENSE_SPARE      # first closing row
    cash_hand    = closing_row + 1
    cash_bank    = closing_row + 2
    total_row    = closing_row + 3
    sign_row     = total_row + 2

    sec(ws, f"C{closing_row}", "Closing Balances")
    ws[f"D{closing_row}"].fill = f(SECTION); ws[f"D{closing_row}"].border = bdr()
    ws[f"A{closing_row}"].border = bdr(); ws[f"B{closing_row}"].border = bdr()

    pln(ws, f"C{cash_hand}", "  Cash in Hand")
    ws[f"D{cash_hand}"].value = 0; ws[f"D{cash_hand}"].number_format = INR
    ws[f"D{cash_hand}"].fill = f(CREAM); ws[f"D{cash_hand}"].border = bdr()
    ws[f"D{cash_hand}"].font = fnt(size=11, color=BLUE_TEXT)
    ws[f"A{cash_hand}"].border = bdr(); ws[f"B{cash_hand}"].border = bdr()

    pln(ws, f"C{cash_bank}", "  Cash in Bank")
    ws[f"D{cash_bank}"].value = 0; ws[f"D{cash_bank}"].number_format = INR
    ws[f"D{cash_bank}"].fill = f(CREAM); ws[f"D{cash_bank}"].border = bdr()
    ws[f"D{cash_bank}"].font = fnt(size=11, color=BLUE_TEXT)
    ws[f"A{cash_bank}"].border = bdr(); ws[f"B{cash_bank}"].border = bdr()

    # Build TOTAL formulas dynamically from row numbers
    # Receipts: opening(8,9) + maintenance(11,12) + puja+donation(14,15) + other(17,18,19) + income_spares(20..24)
    inc_spare_rows = "+".join(f"B{20+i}" for i in range(INCOME_SPARE))
    b_total = f"B8+B9+B11+B12+B14+B15+B17+B18+B19+{inc_spare_rows}"

    # Payments: op expenses(8,9) + operating(10,11,12) + infra(13) + printing(14D) + puja donation(15D)
    #           + fire ext(17D) + new pump(18D) + sddm(19D)
    #           + misc rows (exp_start..+4) + exp_spares + closing
    fixed_exp_rows = "+".join(f"D{exp_start+i}" for i in range(5))
    exp_spare_rows = "+".join(f"D{exp_spare_row_start+i}" for i in range(EXPENSE_SPARE))
    d_total = (f"D8+D9+D10+D11+D12+D13+D14+D15+D17+D18+D19+"
               f"{fixed_exp_rows}+{exp_spare_rows}+D{cash_hand}+D{cash_bank}")

    tot(ws, f"A{total_row}", val="TOTAL", fmt="General")
    tot(ws, f"B{total_row}", formula=b_total)
    tot(ws, f"C{total_row}", val="TOTAL", fmt="General")
    tot(ws, f"D{total_row}", formula=d_total)
    ws.row_dimensions[total_row].height = 20

    ws[f"A{sign_row}"].value = "Signed by: Signature Of President"
    ws[f"A{sign_row}"].font  = fnt(size=9, color=SUBTEXT)
    ws[f"C{sign_row}"].value = "Signed by: Signature Of Secretary & Treasurer"
    ws[f"C{sign_row}"].font  = fnt(size=9, color=SUBTEXT)

    ws.column_dimensions["A"].width = 40
    ws.column_dimensions["B"].width = 16
    ws.column_dimensions["C"].width = 44
    ws.column_dimensions["D"].width = 16


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    wb = Workbook()
    wb.remove(wb.active)
    build_handover(wb)
    build_maintenance(wb)
    build_puja(wb)
    build_income(wb)
    build_expenses(wb)
    build_withdrawals(wb)
    build_rp(wb)
    out = os.path.join(os.path.dirname(__file__), "Debaloy_2026-27.xlsx")
    wb.save(out)
    print(f"[OK] Saved: {out}")


if __name__ == "__main__":
    main()
