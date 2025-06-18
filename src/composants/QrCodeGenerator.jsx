import React, { useState, useRef } from 'react';
import QRCode from 'react-qr-code';
import { toPng } from 'html-to-image';

const QRCodeGenerator = () => {
  const [text, setText] = useState('https://example.com');
  const [image, setImage] = useState(null);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [fgColor, setFgColor] = useState('#000000');
  const qrRef = useRef(null);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setImage(reader.result);
      reader.readAsDataURL(file);
    }
  };

  const downloadQRCode = () => {
    if (qrRef.current) {
      toPng(qrRef.current, { pixelRatio: 2 })
        .then((dataUrl) => {
          const link = document.createElement('a');
          link.download = 'qrcode.png';
          link.href = dataUrl;
          link.click();
        })
        .catch((err) =>
          console.error('Erreur lors du téléchargement du QR code:', err)
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-lg w-full">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          🎯 Générateur de QR Code Personnalisé
        </h1>

        {/* Saisie texte */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Texte ou URL à encoder
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="https://..."
            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Upload image */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Image centrale (facultative)
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="w-full p-2 border border-gray-300 rounded-md"
          />
        </div>

        {/* Couleurs */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Couleur du QR
            </label>
            <input
              type="color"
              value={fgColor}
              onChange={(e) => setFgColor(e.target.value)}
              className="w-full h-10 p-1 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Couleur de fond
            </label>
            <input
              type="color"
              value={bgColor}
              onChange={(e) => setBgColor(e.target.value)}
              className="w-full h-10 p-1 border border-gray-300 rounded"
            />
          </div>
        </div>

        {/* QR Code rendu */}
        <div className="flex justify-center mb-4">
          <div
            ref={qrRef}
            className="relative w-72 h-64 flex items-center justify-center bg-white p-2"
            style={{ backgroundColor: bgColor }}
          >
            <QRCode
              value={text}
              size={256}
              level="H"
              fgColor={fgColor}
              bgColor={bgColor}
              includeMargin={false}
              className="rounded-md"
            />
            {image && (
              <img
                src={image}
                alt="Centre"
                className="absolute w-16 h-16 rounded-full border-2 border-white"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </div>
        </div>

        {/* Bouton téléchargement */}
        <button
          onClick={downloadQRCode}
          className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors"
        >
          Télécharger le QR Code
        </button>
      </div>
    </div>
  );
};

export default QRCodeGenerator;
