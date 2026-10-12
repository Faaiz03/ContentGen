import sys
import socket
import ipaddress
from urllib.parse import urlparse
import requests
import trafilatura

def is_valid_url(url):
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https'):
            return False, "Invalid scheme. Only http and https are supported."
        
        hostname = parsed.hostname
        if not hostname:
            return False, "No hostname found in URL."

        # Resolve IP to block internal/private networks
        ip_addr = socket.gethostbyname(hostname)
        ip_obj = ipaddress.ip_address(ip_addr)
        
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
            return False, "URL resolves to a private or local IP."
            
        return True, ""
    except socket.gaierror:
        return False, "Could not resolve hostname."
    except Exception as e:
        return False, f"URL validation failed: {str(e)}"

def fetch_and_extract(url):
    valid, msg = is_valid_url(url)
    if not valid:
        return {"error": msg}

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    try:
        session = requests.Session()
        session.max_redirects = 5
        
        response = session.get(url, headers=headers, timeout=15, stream=True)
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '')
        if 'text/html' not in content_type:
            return {"error": f"Invalid content type: {content_type}. Expected text/html."}
            
        content = b""
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                content += chunk
                if len(content) > 5 * 1024 * 1024:
                    return {"error": "Page is too large (exceeds 5MB)."}
                    
        html_content = content.decode('utf-8', errors='replace')
        
    except requests.exceptions.Timeout:
        return {"error": "Request timed out after 15 seconds."}
    except requests.exceptions.TooManyRedirects:
        return {"error": "Too many redirects."}
    except requests.exceptions.RequestException as e:
        return {"error": f"Failed to fetch page: {str(e)}"}

    extracted_text = trafilatura.extract(
        html_content, 
        include_comments=False,
        include_tables=False,
        no_fallback=False
    )
    
    if not extracted_text or len(extracted_text) < 500:
        return {"error": "Too little text extracted from the page (under 500 characters)."}

    # Handle text truncation
    text = extracted_text
    if len(text) > 30000:
        text = text[:27000] + "\n\n... [TRUNCATED] ...\n\n" + text[-3000:]

    # Safely extract metadata
    title, author, date = "", "", ""
    try:
        metadata = trafilatura.extract_metadata(html_content)
        if metadata:
            title = metadata.title or ""
            author = metadata.author or ""
            date = metadata.date or ""
    except Exception:
        pass

    return {
        "title": title,
        "author": author,
        "date": date,
        "text": text,
        "length": len(text)
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python cli_extract.py <url>")
        sys.exit(1)
        
    url = sys.argv[1]
    print(f"Fetching: {url}")
    res = fetch_and_extract(url)
    if "error" in res:
        print(f"Error: {res['error']}")
    else:
        print(f"Title: {res['title']}")
        print(f"Length: {res['length']} characters")
        print(f"Author: {res.get('author')}")
        print(f"Date: {res.get('date')}")
        print("--- First 500 chars ---")
        print(res['text'][:500])
