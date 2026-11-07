#!/usr/bin/env python3
"""
Standalone Python script to fetch RBI Kolkata bank holidays
using only standard library.
"""

import urllib.request
import urllib.parse
import html.parser
import csv
import re
from datetime import datetime


class RBIHolidayParser(html.parser.HTMLParser):
    """HTML Parser to extract holiday table data."""
    
    def __init__(self):
        super().__init__()
        self.table_data = []
        self.current_row = []
        self.in_table = False
        self.in_cell = False
        self.current_cell_text = ""
        self.table_count = 0
        self.target_table_index = 2  # Third table (0-indexed)
        self.current_table_index = -1
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        # Check if we're entering a table with class 'tablebg'
        if tag == 'table' and 'class' in attrs_dict:
            classes = attrs_dict['class'].split() if isinstance(attrs_dict['class'], str) else attrs_dict['class']
            if 'tablebg' in classes:
                self.current_table_index += 1
                if self.current_table_index == self.target_table_index:
                    self.in_table = True
                    return
        
        # If we're in the target table, process cells
        if self.in_table:
            if tag == 'tr':
                self.current_row = []
            elif tag in ['td', 'th']:
                self.in_cell = True
                self.current_cell_text = ""
    
    def handle_endtag(self, tag):
        if self.in_table:
            if tag in ['td', 'th']:
                if self.in_cell:
                    self.current_row.append(self.current_cell_text.strip())
                    self.in_cell = False
                    self.current_cell_text = ""
            elif tag == 'tr':
                if self.current_row:
                    self.table_data.append(self.current_row)
                    self.current_row = []
            elif tag == 'table':
                self.in_table = False
    
    def handle_data(self, data):
        if self.in_table and self.in_cell:
            self.current_cell_text += data


def fetch_webpage(url, headers=None, data=None, cookies=None):
    """Fetch webpage content with optional POST data."""
    if headers is None:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
    
    # Prepare headers with cookies
    request_headers = headers.copy() if headers else {}
    if cookies:
        cookie_header = '; '.join([f'{name}={value}' for name, value in cookies.items()])
        request_headers['Cookie'] = cookie_header
    
    try:
        if data is None:
            # GET request
            req = urllib.request.Request(url, headers=request_headers)
            with urllib.request.urlopen(req) as response:
                return response.read().decode('utf-8'), response.info()
        else:
            # POST request
            post_data = urllib.parse.urlencode(data).encode('utf-8')
            req = urllib.request.Request(url, data=post_data, headers=request_headers)
            with urllib.request.urlopen(req) as response:
                return response.read().decode('utf-8'), response.info()
    except Exception as e:
        print(f"Error fetching webpage: {e}")
        return None, None


def extract_viewstate_fields(html_content):
    """Extract VIEWSTATE, VIEWSTATEGENERATOR, and EVENTVALIDATION from HTML."""
    fields = {}
    
    # Pattern for VIEWSTATE
    viewstate_match = re.search(r'<input[^>]*id=["\']__VIEWSTATE["\'][^>]*value=["\']([^"\']+)["\']', html_content)
    if viewstate_match:
        fields['__VIEWSTATE'] = viewstate_match.group(1)
    
    # Pattern for VIEWSTATEGENERATOR
    viewstategen_match = re.search(r'<input[^>]*id=["\']__VIEWSTATEGENERATOR["\'][^>]*value=["\']([^"\']+)["\']', html_content)
    if viewstategen_match:
        fields['__VIEWSTATEGENERATOR'] = viewstategen_match.group(1)
    
    # Pattern for EVENTVALIDATION
    eventval_match = re.search(r'<input[^>]*id=["\']__EVENTVALIDATION["\'][^>]*value=["\']([^"\']+)["\']', html_content)
    if eventval_match:
        fields['__EVENTVALIDATION'] = eventval_match.group(1)
    
    return fields


def parse_cookies_from_headers(response_info):
    """Extract cookies from response headers."""
    cookies = {}
    if response_info:
        # Get Set-Cookie headers
        set_cookie_headers = response_info.get_all('Set-Cookie')
        if set_cookie_headers:
            for cookie_header in set_cookie_headers:
                # Extract cookie name and value
                cookie_match = re.match(r'([^=]+)=([^;]+)', cookie_header)
                if cookie_match:
                    cookies[cookie_match.group(1)] = cookie_match.group(2)
        # Also check Cookie header if present
        cookie_header = response_info.get('Cookie')
        if cookie_header:
            for cookie_pair in cookie_header.split(';'):
                parts = cookie_pair.strip().split('=', 1)
                if len(parts) == 2:
                    cookies[parts[0].strip()] = parts[1].strip()
    return cookies


def parse_holiday_table(html_content):
    """Parse the holiday table from HTML content."""
    parser = RBIHolidayParser()
    parser.feed(html_content)
    
    # If parser didn't find data, try alternative method
    if not parser.table_data:
        return parse_holiday_table_alternative(html_content)
    
    return parser.table_data


def parse_holiday_table_alternative(html_content):
    """Alternative method to parse holiday table using regex."""
    table_data = []
    
    # Find all tables with class 'tablebg'
    table_pattern = r'<table[^>]*class=["\'][^"\']*tablebg[^"\']*["\'][^>]*>(.*?)</table>'
    tables = re.findall(table_pattern, html_content, re.DOTALL | re.IGNORECASE)
    
    # Get the third table (index 2)
    if len(tables) >= 3:
        table_html = tables[2]
        
        # Extract rows
        row_pattern = r'<tr[^>]*>(.*?)</tr>'
        rows = re.findall(row_pattern, table_html, re.DOTALL | re.IGNORECASE)
        
        for row_html in rows:
            # Extract cells
            cell_pattern = r'<t[dh][^>]*>(.*?)</t[dh]>'
            cells = re.findall(cell_pattern, row_html, re.DOTALL | re.IGNORECASE)
            
            # Clean cell content (remove HTML tags and decode entities)
            cleaned_cells = []
            for cell in cells:
                # Remove HTML tags
                cell_text = re.sub(r'<[^>]+>', '', cell)
                # Decode common HTML entities
                cell_text = cell_text.replace('&nbsp;', ' ')
                cell_text = cell_text.replace('&amp;', '&')
                cell_text = cell_text.replace('&lt;', '<')
                cell_text = cell_text.replace('&gt;', '>')
                cell_text = cell_text.replace('&quot;', '"')
                cell_text = cell_text.replace('&#39;', "'")
                # Strip whitespace
                cell_text = ' '.join(cell_text.split())
                cleaned_cells.append(cell_text)
            
            if cleaned_cells:
                table_data.append(cleaned_cells)
    
    return table_data


def write_to_csv(data, filename='KolBankHolidays.csv'):
    """Write holiday data to CSV file."""
    if not data:
        print("No data to write.")
        return
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.writer(csvfile)
        for row in data:
            writer.writerow(row)
    
    print(f"Successfully wrote {len(data)} rows to {filename}")


def main():
    """Main function to orchestrate the scraping and CSV creation."""
    # Current year
    current_year = datetime.now().year
    
    url = 'https://rbi.org.in/Scripts/HolidayMatrixDisplay.aspx'
    
    # Headers with Chrome user agent
    headers = {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "accept-language": "en-GB,en;q=0.9",
        "priority": "u=0, i",
        "sec-ch-ua": '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    }
    
    print("Fetching initial webpage...")
    html_content, response_info = fetch_webpage(url, headers=headers)
    
    if not html_content:
        print("Failed to fetch webpage.")
        return
    
    # Extract cookies from response
    cookies = parse_cookies_from_headers(response_info)
    
    # Extract VIEWSTATE fields
    print("Extracting form fields...")
    viewstate_fields = extract_viewstate_fields(html_content)
    
    if not viewstate_fields:
        print("Failed to extract VIEWSTATE fields.")
        return
    
    # Prepare POST data
    data = {
        '__EVENTTARGET': '',
        '__EVENTARGUMENT': '',
        '__VIEWSTATE': viewstate_fields.get('__VIEWSTATE', ''),
        '__VIEWSTATEGENERATOR': viewstate_fields.get('__VIEWSTATEGENERATOR', ''),
        '__EVENTVALIDATION': viewstate_fields.get('__EVENTVALIDATION', ''),
        'UsrFontCntr$txtSearch': '',
        'drRegionalOffice': '26',  # Code for Kolkata
        'drMonth': '0',
        'drYear': str(current_year),
        'btnGo': 'GO'
    }
    
    # Update headers for POST request
    post_headers = headers.copy()
    post_headers['Content-Type'] = 'application/x-www-form-urlencoded'
    post_headers['Referer'] = url
    post_headers['Origin'] = 'https://rbi.org.in'
    
    print(f"Fetching holidays for Kolkata, year {current_year}...")
    post_html_content, post_response_info = fetch_webpage(url, headers=post_headers, data=data, cookies=cookies)
    
    if not post_html_content:
        print("Failed to fetch POST response.")
        return
    
    # Update cookies from POST response
    post_cookies = parse_cookies_from_headers(post_response_info)
    if post_cookies:
        cookies.update(post_cookies)
    
    # Parse the holiday table
    print("Parsing holiday table...")
    table_data = parse_holiday_table(post_html_content)
    
    if not table_data:
        print("No holiday data found. The page structure might have changed.")
        # Debug: check if we got a response
        if 'tablebg' in post_html_content.lower():
            print("Warning: Found 'tablebg' in response but couldn't parse table.")
        return
    
    # Write to CSV
    write_to_csv(table_data)
    print(f"Found {len(table_data)} rows of holiday data")


if __name__ == "__main__":
    main()

