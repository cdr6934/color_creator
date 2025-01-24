// Global variable to store the original image
let originalImage = null;

function toHex(value) {
    // Ensure value is within 0-255 range
    value = Math.min(255, Math.max(0, value));
    return value.toString(16).padStart(2, "0").toUpperCase();
}

function rgbToHex(r, g, b) {
    // Ensure all values are numbers and in valid range
    r = Math.min(255, Math.max(0, parseInt(r) || 0));
    g = Math.min(255, Math.max(0, parseInt(g) || 0));
    b = Math.min(255, Math.max(0, parseInt(b) || 0));
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getComplementary(hex) {
    hex = hex.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const compR = 255 - r;
    const compG = 255 - g;
    const compB = 255 - b;
    return `#${toHex(compR)}${toHex(compG)}${toHex(compB)}`;
}

function rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;

    let h = 0;
    let s = max === 0 ? 0 : diff / max;
    let v = max;

    if (diff !== 0) {
        switch (max) {
            case r:
                h = (g - b) / diff + (g < b ? 6 : 0);
                break;
            case g:
                h = (b - r) / diff + 2;
                break;
            case b:
                h = (r - g) / diff + 4;
                break;
        }
        h /= 6;
    }

    return { h, s, v };
}

function getColorScore(hsv, method) {
    switch (method) {
        case 'vibrant':
            return hsv.s * hsv.v;
        case 'muted':
            return (1 - Math.abs(hsv.s - 0.5)) * hsv.v;
        case 'balanced':
            return hsv.s * hsv.v * (1 - Math.abs(0.5 - (hsv.h % 1)));
        default: // dominant
            return 1;
    }
}

function adjustSaturation(canvas, saturation) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
        const hsv = rgbToHsv(data[i], data[i + 1], data[i + 2]);
        hsv.s = Math.min(1, Math.max(0, hsv.s * (saturation / 100)));
        
        const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
        data[i] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
    }
    
    ctx.putImageData(imageData, 0, 0);
    return canvas;
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);

    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

async function getDominantColors(image, numColors) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    
    const saturation = parseInt(document.getElementById('saturationValue').value);
    adjustSaturation(canvas, saturation);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const colorMap = new Map();
    
    const stride = Math.max(1, Math.floor((imageData.length / 4) / 10000));
    const method = document.getElementById('colorAlgorithm').value;
    
    for (let i = 0; i < imageData.length; i += stride * 4) {
        const r = imageData[i];
        const g = imageData[i + 1];
        const b = imageData[i + 2];
        
        const quantizedR = Math.round(r / 32) * 32;
        const quantizedG = Math.round(g / 32) * 32;
        const quantizedB = Math.round(b / 32) * 32;
        
        const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
        colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
    }
    
    const colorArray = Array.from(colorMap.entries())
        .map(([color, count]) => {
            const [r, g, b] = color.split(',').map(Number);
            const hsv = rgbToHsv(r, g, b);
            return {
                color: rgbToHex(r, g, b),
                count,
                hsv,
                score: getColorScore(hsv, method) * count
            };
        });

    const selectedColors = colorArray
        .sort((a, b) => b.score - a.score)
        .slice(0, numColors);

    return selectedColors
        .sort((a, b) => {
            if (Math.abs(a.hsv.h - b.hsv.h) > 0.01) {
                return a.hsv.h - b.hsv.h;
            }
            if (Math.abs(a.hsv.s - b.hsv.s) > 0.01) {
                return b.hsv.s - a.hsv.s;
            }
            return b.hsv.v - a.hsv.v;
        })
        .map(item => item.color);
}

function displayColors(colors) {
    const palette = document.getElementById('colorPalette');
    const strip = document.getElementById('colorStrip');
    const exportButton = document.getElementById('exportProcreate');
    
    // Show export button when colors are displayed
    exportButton.style.display = 'inline-block';
    
    palette.innerHTML = '';
    strip.innerHTML = '';
    
    colors.forEach(color => {
        const colorBox = document.createElement('div');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = color;
        
        const colorInfo = document.createElement('div');
        colorInfo.className = 'color-info';
        colorInfo.innerHTML = `<div>${color}</div>`;
        
        // Add click handler for copying
        colorBox.addEventListener('click', () => {
            copyToClipboard(color);
        });
        
        colorBox.appendChild(colorInfo);
        palette.appendChild(colorBox);
        
        const stripSegment = document.createElement('div');
        stripSegment.className = 'color-strip-segment';
        stripSegment.style.backgroundColor = color;
        strip.appendChild(stripSegment);
    });
}

async function downloadSwatchFile(data, filename) {
    const zip = new JSZip();
    zip.file("Swatches.json", JSON.stringify(data, null, 2));
    
    const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: {
            level: 9
        }
    });
    
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.swatches`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function saveStateToLocalStorage(imageData = null) {
    const state = {
        image: imageData || localStorage.getItem('savedImage'),
        imageName: document.getElementById('imageInput').value.split('\\').pop() || localStorage.getItem('savedImageName'),
        colorAlgorithm: document.getElementById('colorAlgorithm').value,
        numColors: document.getElementById('numColors').value,
        paletteName: document.getElementById('paletteName').value,
        saturation: document.getElementById('saturationValue').value,
        lastUpdated: new Date().toISOString()
    };
    
    localStorage.setItem('paletteGeneratorState', JSON.stringify(state));
    updateClearButtonVisibility();
}

function loadStateFromLocalStorage() {
    const stateStr = localStorage.getItem('paletteGeneratorState');
    if (!stateStr) return false;

    const state = JSON.parse(stateStr);
    
    if (state.image) {
        const image = document.getElementById('imagePreview');
        image.src = state.image;
        
        image.onload = async () => {
            originalImage = image;
            document.getElementById('colorAlgorithm').value = state.colorAlgorithm;
            document.getElementById('numColors').value = state.numColors;
            document.getElementById('paletteName').value = state.paletteName;
            document.getElementById('saturationValue').value = state.saturation;
            
            const colors = await getDominantColors(image, parseInt(state.numColors));
            displayColors(colors);
        };
        return true;
    }
    return false;
}

function updateClearButtonVisibility() {
    const clearButton = document.getElementById('clearImage');
    const state = localStorage.getItem('paletteGeneratorState');
    clearButton.style.display = state ? 'inline-block' : 'none';
}

function createProcreateJson(colors, paletteName) {
    return {
        "name": paletteName,
        "swatches": colors.map(color => {
            // Convert hex to RGB
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            
            // Convert RGB to HSV
            const hsv = rgbToHsv(r, g, b);
            
            return {
                "hue": hsv.h,
                "saturation": hsv.s,
                "brightness": hsv.v,
                "alpha": 1,
                "colorSpace": 0
            };
        })
    };
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2500);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${text} to clipboard!`);
    }).catch(err => {
        showToast('Failed to copy color code');
        console.error('Failed to copy:', err);
    });
}

// Add this function to load the default image
async function loadDefaultImage() {
    try {
        const response = await fetch('monet.png');
        const blob = await response.blob();
        const file = new File([blob], 'monet.png', { type: 'image/png' });
        
        // Use existing image handling logic
        const image = document.getElementById('imagePreview');
        image.src = URL.createObjectURL(file);
        
        // Save to localStorage
        const reader = new FileReader();
        reader.onload = async function(e) {
            await saveStateToLocalStorage(e.target.result);
        };
        reader.readAsDataURL(file);
        
        image.onload = async () => {
            originalImage = image;
            const numColors = parseInt(document.getElementById('numColors').value);
            const colors = await getDominantColors(image, numColors);
            displayColors(colors);
        }; 
    } catch (error) {
        console.error('Error loading default image:', error);
    }
}

// Add new function to save to KV store
async function saveToKVStore(paletteData) {
    try {
        const response = await fetch('/api/palettes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(paletteData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to save palette');
        }
        
        const result = await response.json();
        return result.id; // Assuming the API returns an ID for the saved palette
    } catch (error) {
        console.error('Error saving to KV store:', error);
        throw error;
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    loadStateFromLocalStorage();
    
    // Hide export button initially
    document.getElementById('exportProcreate').style.display = 'none';

    document.getElementById('exportProcreate').addEventListener('click', async () => {
        const palette = document.getElementById('colorPalette');
        if (palette.children.length === 0) {
            alert('Please generate a color palette first!');
            return;
        }

        const colors = Array.from(palette.children)
            .map(box => {
                const bgColor = window.getComputedStyle(box).backgroundColor;
                const rgb = bgColor.match(/\d+/g);
                
                if (!rgb || rgb.length !== 3) {
                    console.error('Invalid color format:', bgColor);
                    return null;
                }

                const [r, g, b] = rgb.map(n => {
                    const num = parseInt(n);
                    return isNaN(num) ? 0 : Math.min(255, Math.max(0, num));
                });

                return rgbToHex(r, g, b);
            })
            .filter(color => color && /^#[0-9A-F]{6}$/i.test(color));

        if (colors.length === 0) {
            alert('No valid colors found in the palette!');
            return;
        }

        const paletteName = document.getElementById('paletteName').value || 'My Color Palette';
        const procreateData = createProcreateJson(colors, paletteName);
        
        try {
            // Save to KV store
            await saveToKVStore({
                name: paletteName,
                colors: procreateData,
                createdAt: new Date().toISOString()
            });
            showToast('Palette saved successfully!');
            
            // Continue with the download
            await downloadSwatchFile(procreateData, paletteName.toLowerCase().replace(/\s+/g, '_'));
        } catch (error) {
            showToast('Failed to save palette');
            console.error('Error during export:', error);
        }
    });

    document.getElementById('clearImage').addEventListener('click', () => {
        localStorage.removeItem('paletteGeneratorState');
        document.getElementById('imagePreview').src = '';
        document.getElementById('colorPalette').innerHTML = '';
        document.getElementById('colorStrip').innerHTML = '';
        
        document.getElementById('colorAlgorithm').value = 'dominant';
        document.getElementById('numColors').value = '30';
        document.getElementById('paletteName').value = 'My Color Palette';
        document.getElementById('saturationValue').value = '100';
        
        document.getElementById('exportProcreate').style.display = 'none';
        updateClearButtonVisibility();
    });

    document.getElementById('imageInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            const image = document.getElementById('imagePreview');
            image.src = URL.createObjectURL(file);
            
            try {
                const reader = new FileReader();
                reader.onload = async function(event) {
                    await saveStateToLocalStorage(event.target.result);
                };
                reader.readAsDataURL(file);
            } catch (e) {
                console.error('Failed to save state to localStorage:', e);
            }
            
            image.onload = async () => {
                originalImage = image;
                const numColors = parseInt(document.getElementById('numColors').value);
                const colors = await getDominantColors(image, numColors);
                displayColors(colors);
            };
        }
    });

    ['colorAlgorithm', 'numColors', 'paletteName', 'saturationValue'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            saveStateToLocalStorage();
            if (originalImage) {
                const numColors = parseInt(document.getElementById('numColors').value);
                getDominantColors(originalImage, numColors).then(displayColors);
            }
        });
    });

    // Check for saved image, if none exists, load default
    const savedImage = localStorage.getItem('savedImage');
    if (!savedImage) {
        loadDefaultImage();
    }
}); 
