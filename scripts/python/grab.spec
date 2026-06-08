# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for grab.py
# Run from repo root: pyinstaller scripts/python/grab.spec

import sys, os
sys.path.insert(0, os.path.join(SPECPATH))   # so Analysis finds grab_common etc.

block_cipher = None

a = Analysis(
    [os.path.join(SPECPATH, 'grab.py')],
    pathex=[SPECPATH],
    binaries=[],
    datas=[],
    hiddenimports=[
        'sources',
        'sources.wikipedia',
        'sources.aimodel',
        'sources.ai_helpers',
        'sources.huggingface',
        'grab_common',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='grab',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    target_arch=None,
)
