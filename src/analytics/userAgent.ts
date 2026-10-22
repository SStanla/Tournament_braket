// Minimal User-Agent classification for the usage dashboard. Coarse buckets
// are all the dashboard needs, so a small rule list beats a parser dependency.

export interface UserAgentInfo {
  device: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot';
  browser: string;
  os: string;
}

export function parseUserAgent(ua: string): UserAgentInfo {
  const device: UserAgentInfo['device'] =
    /bot|crawler|spider|crawling|headless|lighthouse/i.test(ua)
      ? 'Bot'
      : /ipad|tablet|(android(?!.*mobile))/i.test(ua)
        ? 'Tablet'
        : /mobi|iphone|ipod|android/i.test(ua)
          ? 'Mobile'
          : 'Desktop';

  const browser = /edg\//i.test(ua)
    ? 'Edge'
    : /opr\/|opera/i.test(ua)
      ? 'Opera'
      : /samsungbrowser/i.test(ua)
        ? 'Samsung Internet'
        : /firefox|fxios/i.test(ua)
          ? 'Firefox'
          : /chrome|crios/i.test(ua)
            ? 'Chrome'
            : /safari/i.test(ua)
              ? 'Safari'
              : 'Other';

  const os = /windows/i.test(ua)
    ? 'Windows'
    : /iphone|ipad|ipod/i.test(ua)
      ? 'iOS'
      : /android/i.test(ua)
        ? 'Android'
        : /mac os x|macintosh/i.test(ua)
          ? 'macOS'
          : /cros/i.test(ua)
            ? 'ChromeOS'
            : /linux/i.test(ua)
              ? 'Linux'
              : 'Other';

  return { device, browser, os };
}
