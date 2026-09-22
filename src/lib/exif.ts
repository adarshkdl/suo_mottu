// Minimal EXIF GPS reader for JPEG files - extracts latitude/longitude if present.
// No external dependency: walks the JPEG APP1/EXIF segment and GPS IFD by hand.

interface GpsCoords {
  latitude: number;
  longitude: number;
}

function readRational(view: DataView, offset: number, littleEndian: boolean): number {
  const numerator = view.getUint32(offset, littleEndian);
  const denominator = view.getUint32(offset + 4, littleEndian);
  return denominator === 0 ? 0 : numerator / denominator;
}

function dmsToDecimal(degrees: number, minutes: number, seconds: number, ref: string): number {
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

function parseGpsIfd(view: DataView, ifdOffset: number, tiffStart: number, littleEndian: boolean): GpsCoords | null {
  const entryCount = view.getUint16(ifdOffset, littleEndian);
  let latRef = '';
  let lonRef = '';
  let lat: number[] | null = null;
  let lon: number[] | null = null;

  for (let i = 0; i < entryCount; i++) {
    const entryOffset = ifdOffset + 2 + i * 12;
    const tag = view.getUint16(entryOffset, littleEndian);
    const type = view.getUint16(entryOffset + 2, littleEndian);
    const count = view.getUint32(entryOffset + 4, littleEndian);
    const valueOffsetField = entryOffset + 8;

    if (tag === 0x0001 /* GPSLatitudeRef */ && type === 2) {
      latRef = String.fromCharCode(view.getUint8(valueOffsetField));
    } else if (tag === 0x0003 /* GPSLongitudeRef */ && type === 2) {
      lonRef = String.fromCharCode(view.getUint8(valueOffsetField));
    } else if ((tag === 0x0002 || tag === 0x0004) && type === 5 && count === 3) {
      // GPSLatitude / GPSLongitude: 3 rationals (deg, min, sec), stored at an offset since >4 bytes
      const dataOffset = tiffStart + view.getUint32(valueOffsetField, littleEndian);
      const deg = readRational(view, dataOffset, littleEndian);
      const min = readRational(view, dataOffset + 8, littleEndian);
      const sec = readRational(view, dataOffset + 16, littleEndian);
      if (tag === 0x0002) lat = [deg, min, sec];
      else lon = [deg, min, sec];
    }
  }

  if (!lat || !lon || !latRef || !lonRef) return null;

  return {
    latitude: dmsToDecimal(lat[0], lat[1], lat[2], latRef),
    longitude: dmsToDecimal(lon[0], lon[1], lon[2], lonRef),
  };
}

/**
 * Reads GPS coordinates from a JPEG's EXIF metadata, if present.
 * Returns null if the file isn't a JPEG, has no EXIF data, or no GPS tags.
 */
export function readGpsFromJpeg(buffer: ArrayBuffer): GpsCoords | null {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null; // not a JPEG

  let offset = 2;
  while (offset < view.byteLength - 4) {
    const marker = view.getUint16(offset);
    if ((marker & 0xff00) !== 0xff00) break;

    if (marker === 0xffe1) {
      // APP1 - likely EXIF
      const segmentLength = view.getUint16(offset + 2);
      const exifStart = offset + 4;
      if (
        view.getUint32(exifStart) === 0x45786966 && // "Exif"
        view.getUint16(exifStart + 4) === 0x0000
      ) {
        const tiffStart = exifStart + 6;
        const byteOrder = view.getUint16(tiffStart);
        const littleEndian = byteOrder === 0x4949; // "II"
        const firstIfdOffset = view.getUint32(tiffStart + 4, littleEndian);
        const ifd0Offset = tiffStart + firstIfdOffset;

        const entryCount = view.getUint16(ifd0Offset, littleEndian);
        for (let i = 0; i < entryCount; i++) {
          const entryOffset = ifd0Offset + 2 + i * 12;
          const tag = view.getUint16(entryOffset, littleEndian);
          if (tag === 0x8825 /* GPS IFD pointer */) {
            const gpsIfdOffset = tiffStart + view.getUint32(entryOffset + 8, littleEndian);
            return parseGpsIfd(view, gpsIfdOffset, tiffStart, littleEndian);
          }
        }
        return null; // EXIF present but no GPS IFD
      }
      offset += 2 + segmentLength;
    } else if (marker === 0xffd8 || marker === 0xffd9) {
      offset += 2;
    } else {
      const segmentLength = view.getUint16(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  return null;
}

export function formatCoords(coords: GpsCoords): string {
  return `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`;
}
