import base64, struct, zlib

def create_png(size, bg_color, star_color):
    w = h = size
    # Create pixel data
    pixels = []
    cx, cy = w//2, h//2
    r = w * 0.38
    
    for y in range(h):
        row = []
        for x in range(w):
            dx, dy = x - cx, y - cy
            dist = (dx*dx + dy*dy)**0.5
            # Circle background
            if dist < r:
                row.extend(bg_color)
            else:
                row.extend([0,0,0,0])
        pixels.append(bytes(row))
    
    # PNG header
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    raw = b''
    for row in pixels:
        raw += b'\x00' + row
    idat = zlib.compress(raw)
    
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', ihdr)
    png += chunk(b'IDAT', idat)
    png += chunk(b'IEND', b'')
    return png

# Dark background with gold color
bg = [20, 20, 20, 240]
for size, fname in [(48, 'icons/icon48.png'), (96, 'icons/icon96.png')]:
    with open(fname, 'wb') as f:
        f.write(create_png(size, bg, [245, 197, 24]))
print("Icons created")
