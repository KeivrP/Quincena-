# Video promocional (motion graphics por código)

Pipeline determinista: `index.html` dibuja cada fotograma según `seek(t)`, `render.js` (Playwright) captura
los fotogramas y ffmpeg arma el MP4. `music.py` sintetiza la música y los efectos (120 BPM) con numpy.

```bash
mkdir -p caps fonts && cp ../capturas/*.png caps/
# fonts/p400..p800.ttf: Poppins (paquete @expo-google-fonts/poppins)
node render.js v frames_v 30        # vertical 1080x1920 ("h" = horizontal 1920x1080)
python3 music.py audio.wav && ffmpeg -i audio.wav -af loudnorm=I=-14:TP=-1.5:LRA=11 -ar 48000 audio_norm.wav
ffmpeg -framerate 30 -i frames_v/f%05d.png -i audio_norm.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest promo-vertical.mp4
```
