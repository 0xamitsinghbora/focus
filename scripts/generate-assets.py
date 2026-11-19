import os
from PIL import Image

def generate():
    src_1024 = 'build/icon-1024.png'
    if not os.path.exists(src_1024):
        raise FileNotFoundError(f'{src_1024} not found!')

    im1024 = Image.open(src_1024).convert('RGBA')

    sizes = [512, 256, 128, 64, 32, 16]
    for sz in sizes:
        resized = im1024.resize((sz, sz), Image.Resampling.LANCZOS)
        out_path = f'build/icon-{sz}.png'
        resized.save(out_path, 'PNG', optimize=True)
        print(f'Generated {out_path}')

    # build/icon.png is 512x512
    im512 = im1024.resize((512, 512), Image.Resampling.LANCZOS)
    im512.save('build/icon.png', 'PNG', optimize=True)
    print('Generated build/icon.png')

    # build/icon.ico - multi-resolution ICO for Windows
    # Includes all standard Windows taskbar and shell sizes: 16, 24, 32, 48, 64, 128, 256
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    im1024.save('build/icon.ico', format='ICO', sizes=ico_sizes)
    print('Generated build/icon.ico with multi-resolution frames:', ico_sizes)

    # build/icon.icns for macOS
    try:
        im1024.save('build/icon.icns', format='ICNS')
        print('Generated build/icon.icns')
    except Exception as e:
        print('Skipped ICNS:', e)

if __name__ == '__main__':
    generate()
