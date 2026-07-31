export async function jpegExifOrientation(file: File) {
  if (file.type !== "image/jpeg") return 1;
  const buffer = await file.slice(0, 256 * 1024).arrayBuffer();
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;
  let offset = 2;
  while (offset + 4 <= view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return null;
    const marker = view.getUint8(offset + 1);
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > view.byteLength) return null;
    if (marker === 0xe1 && length >= 16 && view.getUint32(offset + 4, false) === 0x45786966) {
      const tiff = offset + 10;
      const byteOrder = view.getUint16(tiff, false);
      if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
      const littleEndian = byteOrder === 0x4949;
      const directory = tiff + view.getUint32(tiff + 4, littleEndian);
      if (directory + 2 > view.byteLength) return null;
      const entries = view.getUint16(directory, littleEndian);
      for (let index = 0; index < entries; index += 1) {
        const entry = directory + 2 + index * 12;
        if (entry + 12 > view.byteLength) return null;
        if (view.getUint16(entry, littleEndian) === 0x0112) return view.getUint16(entry + 8, littleEndian);
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}
