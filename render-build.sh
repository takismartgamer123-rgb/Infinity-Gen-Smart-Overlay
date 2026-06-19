#!/usr/bin/env bash
# Infinity Gen ♾️ - سكريبت البناء المضاد لريندر

echo "♾️ تثبيت مكتبات الرسم للسلحفاة الجلادة..."

apt-get update
apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev

echo "♾️ تثبيت Node modules..."
npm install

echo "♾️ جاهز للإقلاع بامممم"
