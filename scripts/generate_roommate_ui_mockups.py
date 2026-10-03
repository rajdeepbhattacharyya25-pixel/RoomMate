"""
Generate ultra-clean, high-resolution (1080x1920) mobile UI mockups
for the RoomMate 30s video ad scenes with 100% clean typography and zero missing glyphs.
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUTPUT_DIR = Path("scratch/OpenMontage/remotion-composer/public/assets/roommate")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Colors
BG_DARK = (11, 15, 25)
SURFACE_DARK = (17, 24, 39)
CARD_BG = (30, 41, 59)
EMERALD = (16, 185, 129)
EMERALD_BG = (6, 78, 59)
AMBER = (245, 158, 11)
ROSE = (244, 63, 94)
BLUE = (59, 130, 246)
PURPLE = (168, 85, 247)
CYAN = (6, 182, 212)
TEXT_WHITE = (248, 250, 252)
TEXT_MUTED = (148, 163, 184)
BORDER_COLOR = (51, 65, 85)

def get_font(size: int, bold: bool = False):
    try:
        font_name = "segoeuib.ttf" if bold else "segoeui.ttf"
        return ImageFont.truetype(f"C:/Windows/Fonts/{font_name}", size)
    except Exception:
        try:
            font_name = "arialbd.ttf" if bold else "arial.ttf"
            return ImageFont.truetype(f"C:/Windows/Fonts/{font_name}", size)
        except Exception:
            return ImageFont.load_default()

font_hero = get_font(56, bold=True)
font_title = get_font(38, bold=True)
font_heading = get_font(30, bold=True)
font_body = get_font(24, bold=False)
font_body_bold = get_font(24, bold=True)
font_caption = get_font(20, bold=False)
font_badge = get_font(18, bold=True)

def draw_rounded_rect(draw, bbox, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(bbox, radius=radius, fill=fill, outline=outline, width=width)

# -------------------------------------------------------------------------
# Screen 1: Chaotic WhatsApp Room Debt Drama (Cleaned of all missing glyphs)
# -------------------------------------------------------------------------
def create_chat_drama_screen():
    img = Image.new("RGB", (1080, 1920), (12, 19, 31))
    draw = ImageDraw.Draw(img)

    # Chat Header
    draw_rounded_rect(draw, [40, 60, 1040, 200], 28, (15, 23, 42), (30, 41, 59), 2)
    # Avatar badge: Flat 304
    draw.ellipse([70, 90, 150, 170], fill=(239, 68, 68))
    draw.text((110, 130), "304", font=font_badge, fill=TEXT_WHITE, anchor="mm")
    
    # Header Info
    draw.text((180, 110), "Hostel Flat 304 (Boys)", font=font_title, fill=TEXT_WHITE)
    draw.text((180, 155), "Rahul, Amit, Rohan, You • 9+ unread bills", font=font_caption, fill=AMBER)

    # Chat Bubbles
    # Msg 1 - Rahul
    draw_rounded_rect(draw, [60, 250, 840, 430], 24, (30, 41, 59))
    draw_rounded_rect(draw, [90, 275, 270, 305], 8, (59, 130, 246, 50), (59, 130, 246))
    draw.text((180, 290), "Rahul (Roommate)", font=font_badge, fill=(96, 165, 250), anchor="mm")
    draw.text((90, 325), "Guys, Wi-Fi bill Rs.799 is due today!\nWho's paying? Please don't ignore again!", font=font_body, fill=TEXT_WHITE)
    draw.text((800, 395), "10:14 AM", font=font_caption, fill=TEXT_MUTED, anchor="rm")

    # Msg 2 - Amit
    draw_rounded_rect(draw, [60, 460, 920, 650], 24, (30, 41, 59))
    draw_rounded_rect(draw, [90, 485, 200, 515], 8, (244, 114, 182, 50), (244, 114, 182))
    draw.text((145, 500), "Amit", font=font_badge, fill=(244, 114, 182), anchor="mm")
    draw.text((90, 530), "I already paid Rs.950 for the LPG cylinder last week!\nSomeone owes me Rs.316.66 paise each...\nNobody settled with me yet!", font=font_body, fill=TEXT_WHITE)
    draw.text((880, 615), "10:18 AM", font=font_caption, fill=TEXT_MUTED, anchor="rm")

    # Msg 3 - Rohan
    draw_rounded_rect(draw, [60, 680, 880, 850], 24, (30, 41, 59))
    draw_rounded_rect(draw, [90, 705, 200, 735], 8, (251, 191, 36, 50), (251, 191, 36))
    draw.text((145, 720), "Rohan", font=font_badge, fill=(251, 191, 36), anchor="mm")
    draw.text((90, 750), "Wait, didn't Amit owe me Rs.150 for Friday's biryani?\nHow do we calculate who actually owes who?!", font=font_body, fill=TEXT_WHITE)
    draw.text((840, 815), "10:22 AM", font=font_caption, fill=TEXT_MUTED, anchor="rm")

    # Msg 4 - Rahul
    draw_rounded_rect(draw, [60, 880, 820, 1010], 24, (30, 41, 59))
    draw_rounded_rect(draw, [90, 905, 200, 935], 8, (59, 130, 246, 50), (59, 130, 246))
    draw.text((145, 920), "Rahul", font=font_badge, fill=(96, 165, 250), anchor="mm")
    draw.text((90, 945), "Can someone just make an Excel sheet?!\nI'm tired of tracking this every month.", font=font_body, fill=TEXT_WHITE)
    draw.text((780, 975), "10:25 AM", font=font_caption, fill=TEXT_MUTED, anchor="rm")

    # Big Central Floating Warning Callout
    draw_rounded_rect(draw, [80, 1120, 1000, 1420], 32, (244, 63, 94), (255, 255, 255), 3)
    draw.text((540, 1170), "! THE ROOMMATE DEBT DRAMA !", font=font_heading, fill=(255, 255, 255), anchor="mm")
    draw.text((540, 1235), "• Lost Paise in Odd Splits\n• Circular Debt Arguments\n• Zero Financial Privacy", font=font_body_bold, fill=(255, 255, 255), anchor="mm")
    draw.text((540, 1345), "THERE HAS TO BE A BETTER WAY.", font=font_title, fill=(255, 255, 255), anchor="mm")

    img.save(OUTPUT_DIR / "screen_chat_drama.png")
    print(f"Generated clean: {OUTPUT_DIR / 'screen_chat_drama.png'}")


# -------------------------------------------------------------------------
# Screen 2: RoomMate Dashboard (Personal Vault vs Shared Ledger)
# -------------------------------------------------------------------------
def create_vault_ledger_screen():
    img = Image.new("RGB", (1080, 1920), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Top App Bar
    draw_rounded_rect(draw, [40, 60, 1040, 180], 24, SURFACE_DARK, BORDER_COLOR, 2)
    # Custom Brand Icon (Flame shape drawn)
    draw_rounded_rect(draw, [65, 85, 125, 145], 16, EMERALD)
    draw.text((95, 115), "RM", font=font_badge, fill=(15, 23, 42), anchor="mm")
    draw.text((145, 115), "RoomMate", font=font_title, fill=TEXT_WHITE, anchor="lm")
    
    draw_rounded_rect(draw, [840, 90, 1000, 150], 99, (16, 185, 129, 40), EMERALD, 2)
    draw.text((920, 120), "Live Sync", font=font_badge, fill=EMERALD, anchor="mm")

    # Segmented Switcher (Vault vs Ledger)
    draw_rounded_rect(draw, [60, 220, 1020, 310], 20, (15, 23, 42), BORDER_COLOR, 2)
    # Inactive Tab: Personal Vault
    draw.text((300, 265), "Personal Vault", font=font_body_bold, fill=TEXT_MUTED, anchor="mm")
    # Active Tab: Shared Room Ledger
    draw_rounded_rect(draw, [540, 228, 1012, 302], 16, EMERALD)
    draw.text((776, 265), "Shared Ledger (Active)", font=font_body_bold, fill=(15, 23, 42), anchor="mm")

    # Big Net Balance Card
    draw_rounded_rect(draw, [60, 350, 1020, 620], 32, (15, 23, 42), (16, 185, 129), 3)
    draw.text((100, 410), "NET HOUSEHOLD POSITION", font=font_badge, fill=TEXT_MUTED)
    draw.text((100, 490), "+Rs. 1,337.00", font=font_hero, fill=EMERALD)
    draw.text((100, 560), "You are owed by 2 flatmates • Penny-exact balanced", font=font_body, fill=TEXT_WHITE)

    # Section Title
    draw.text((60, 680), "Shared Room Expenses (Hostel 304)", font=font_heading, fill=TEXT_WHITE)

    # Expense Card 1: Wi-Fi
    draw_rounded_rect(draw, [60, 730, 1020, 890], 24, SURFACE_DARK, BORDER_COLOR, 1)
    # Circle tag
    draw.ellipse([85, 785, 125, 825], fill=CYAN)
    draw.text((105, 805), "W", font=font_badge, fill=(15, 23, 42), anchor="mm")
    draw.text((145, 780), "Wi-Fi & Electricity Bill", font=font_body_bold, fill=TEXT_WHITE)
    draw.text((145, 830), "Split 3 ways: Rahul, Amit, You • Rs.400.00 exact", font=font_caption, fill=TEXT_MUTED)
    draw.text((970, 810), "Rs. 1,200.00", font=font_heading, fill=TEXT_WHITE, anchor="rm")

    # Expense Card 2: Groceries
    draw_rounded_rect(draw, [60, 920, 1020, 1080], 24, SURFACE_DARK, BORDER_COLOR, 1)
    draw.ellipse([85, 975, 125, 1015], fill=AMBER)
    draw.text((105, 995), "G", font=font_badge, fill=(15, 23, 42), anchor="mm")
    draw.text((145, 970), "Sunday Mess & Groceries", font=font_body_bold, fill=TEXT_WHITE)
    draw.text((145, 1020), "Paid by You • Rs.800.00 each member", font=font_caption, fill=TEXT_MUTED)
    draw.text((970, 1000), "Rs. 2,400.00", font=font_heading, fill=TEXT_WHITE, anchor="rm")

    # Expense Card 3: Gas Cylinder
    draw_rounded_rect(draw, [60, 1110, 1020, 1270], 24, SURFACE_DARK, BORDER_COLOR, 1)
    draw.ellipse([85, 1165, 125, 1205], fill=ROSE)
    draw.text((105, 1185), "L", font=font_badge, fill=(15, 23, 42), anchor="mm")
    draw.text((145, 1160), "LPG Cooking Gas Cylinder", font=font_body_bold, fill=TEXT_WHITE)
    draw.text((145, 1210), "Remainder penny allocated sequentially • Rs.0 discrepancy", font=font_caption, fill=AMBER)
    draw.text((970, 1190), "Rs. 850.00", font=font_heading, fill=TEXT_WHITE, anchor="rm")

    # Bottom Privacy Banner: Personal Vault
    draw_rounded_rect(draw, [60, 1340, 1020, 1540], 28, (30, 27, 75), (99, 102, 241), 2)
    draw.text((100, 1400), "PRIVATE PERSONAL VAULT", font=font_heading, fill=(165, 180, 252))
    draw.text((100, 1470), "Personal food, shopping & tuition stay 100% hidden from flatmates.\nZero surveillance. Complete student privacy.", font=font_body, fill=TEXT_WHITE)

    # Action Buttons
    draw_rounded_rect(draw, [60, 1600, 520, 1720], 24, (30, 41, 59), BORDER_COLOR, 2)
    draw.text((290, 1660), "+ Add Expense", font=font_body_bold, fill=TEXT_WHITE, anchor="mm")

    draw_rounded_rect(draw, [560, 1600, 1020, 1720], 24, EMERALD)
    draw.text((790, 1660), "Settle Up Now", font=font_body_bold, fill=(15, 23, 42), anchor="mm")

    img.save(OUTPUT_DIR / "screen_vault_ledger.png")
    print(f"Generated clean: {OUTPUT_DIR / 'screen_vault_ledger.png'}")


# -------------------------------------------------------------------------
# Screen 3: 1-Tap UPI Settle Up Screen
# -------------------------------------------------------------------------
def create_upi_settle_screen():
    img = Image.new("RGB", (1080, 1920), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Top Header
    draw.text((540, 120), "Instant UPI Settlement", font=font_title, fill=TEXT_WHITE, anchor="mm")
    draw.text((540, 170), "Circular Debts Collapsed • Exact Remainder Matched", font=font_caption, fill=EMERALD, anchor="mm")

    # Settlement Card
    draw_rounded_rect(draw, [60, 230, 1020, 680], 32, SURFACE_DARK, (16, 185, 129), 2)
    draw.text((540, 300), "You are settling with", font=font_body, fill=TEXT_MUTED, anchor="mm")
    draw.text((540, 370), "Rohan Sharma (Room 304)", font=font_heading, fill=TEXT_WHITE, anchor="mm")
    draw.text((540, 480), "Rs. 450.00", font=font_hero, fill=EMERALD, anchor="mm")
    draw_rounded_rect(draw, [360, 560, 720, 620], 99, (16, 185, 129, 30), EMERALD, 1)
    draw.text((540, 590), "Net Simplified Debt", font=font_badge, fill=EMERALD, anchor="mm")

    # 1-Tap Direct UPI Apps
    draw.text((60, 740), "Select Payment App (1-Tap Deep Link)", font=font_heading, fill=TEXT_WHITE)

    # Google Pay Option
    draw_rounded_rect(draw, [60, 800, 1020, 940], 24, (30, 41, 59), (59, 130, 246), 2)
    draw.ellipse([90, 840, 150, 900], fill=BLUE)
    draw.text((120, 870), "G", font=font_heading, fill=TEXT_WHITE, anchor="mm")
    draw.text((180, 870), "Google Pay", font=font_heading, fill=(96, 165, 250), anchor="lm")
    draw.text((950, 870), "Tap to Pay ->", font=font_body_bold, fill=TEXT_WHITE, anchor="rm")

    # PhonePe Option
    draw_rounded_rect(draw, [60, 970, 1020, 1110], 24, (30, 41, 59), (168, 85, 247), 2)
    draw.ellipse([90, 1010, 150, 1070], fill=PURPLE)
    draw.text((120, 1040), "Pe", font=font_heading, fill=TEXT_WHITE, anchor="mm")
    draw.text((180, 1040), "PhonePe", font=font_heading, fill=(192, 132, 252), anchor="lm")
    draw.text((950, 1040), "Tap to Pay ->", font=font_body_bold, fill=TEXT_WHITE, anchor="rm")

    # Paytm Option
    draw_rounded_rect(draw, [60, 1140, 1020, 1280], 24, (30, 41, 59), (14, 165, 233), 2)
    draw.ellipse([90, 1180, 150, 1240], fill=CYAN)
    draw.text((120, 1210), "P", font=font_heading, fill=TEXT_WHITE, anchor="mm")
    draw.text((180, 1210), "Paytm / Any UPI App", font=font_heading, fill=(56, 189, 248), anchor="lm")
    draw.text((950, 1210), "Tap to Pay ->", font=font_body_bold, fill=TEXT_WHITE, anchor="rm")

    # Proof Verification Box
    draw_rounded_rect(draw, [60, 1340, 1020, 1600], 28, (15, 23, 42), BORDER_COLOR, 2)
    draw.text((100, 1400), "AUTOMATED RECEIPT VERIFICATION", font=font_badge, fill=AMBER)
    draw.text((100, 1460), "1-Tap UPI deep links launch your banking app with exact amount prefilled.\nUploaded payment screenshot automatically verified.", font=font_body, fill=TEXT_WHITE)

    # Safety Guarantee
    draw.text((540, 1720), "Zero Transaction Fees • 100% Direct Bank-to-Bank UPI", font=font_caption, fill=TEXT_MUTED, anchor="mm")

    img.save(OUTPUT_DIR / "screen_upi_settle.png")
    print(f"Generated clean: {OUTPUT_DIR / 'screen_upi_settle.png'}")


if __name__ == "__main__":
    create_chat_drama_screen()
    create_vault_ledger_screen()
    create_upi_settle_screen()
