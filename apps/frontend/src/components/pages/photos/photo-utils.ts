/**
 * Photo-specific formatting utilities.
 */

export const formatFileSize = (bytes: number | null | undefined): string => {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0)
    return "N/A";
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
};

export const formatFNumber = (fNumber: number | null | undefined): string => {
  if (fNumber === null || fNumber === undefined || Number.isNaN(fNumber))
    return "N/A";
  return `f/${fNumber.toFixed(1)}`;
};

export const formatExposureTime = (
  exposureTime: number | null | undefined,
): string => {
  if (
    exposureTime === null ||
    exposureTime === undefined ||
    Number.isNaN(exposureTime)
  )
    return "N/A";
  if (exposureTime >= 0.3 || exposureTime === 0) {
    return `${exposureTime.toFixed(1)}s`;
  }
  const fraction = 1 / exposureTime;
  return `1/${Math.round(fraction)}s`;
};

export const formatDimensions = (
  width: number | null | undefined,
  height: number | null | undefined,
): string => {
  if (width && height) {
    return `${width} x ${height} px`;
  }
  return "N/A";
};

export const formatLocation = (
  city: string | null | undefined,
  country: string | null | undefined,
): string | null => {
  if (city && country) return `${city}, ${country}`;
  if (city) return city;
  if (country) return country;
  return null;
};
