// Config plugin: SSL pinning y cero tráfico en claro, sin módulos nativos de terceros.
//
// - Android: genera res/xml/network_security_config.xml con <pin-set> por dominio y
//   cleartextTrafficPermitted=false. Las builds debug usan otro archivo (src/debug) que permite
//   http hacia Metro y CAs de usuario, para poder depurar.
// - iOS: NSAppTransportSecurity > NSPinnedDomains (iOS 14+, lo respeta NSURLSession y por lo
//   tanto el fetch de React Native).
//
// Se fijan CAs RAÍZ (SPKI SHA-256, base64), no la hoja: Let's Encrypt renueva la hoja cada
// 90 días y rota los intermedios. Si el servidor cambia de CA, hay que actualizar `pins` ANTES
// de que el cambio llegue a producción. En Android los pines dejan de aplicarse en `expiration`
// para no dejar la app inutilizable si nadie los renueva; iOS no tiene esa válvula.
const { AndroidConfig, withAndroidManifest, withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PIN_RE = /^[A-Za-z0-9+/]{43}=$/;

function validate({ domains, pins, expiration }) {
  if (!Array.isArray(domains) || domains.length === 0) throw new Error('withSecureNetwork: falta `domains`.');
  if (!Array.isArray(pins) || pins.length < 2)
    throw new Error('withSecureNetwork: se necesitan al menos 2 pines (uno principal y uno de respaldo).');
  for (const p of pins) if (!PIN_RE.test(p)) throw new Error(`withSecureNetwork: pin inválido "${p}".`);
  if (expiration && !/^\d{4}-\d{2}-\d{2}$/.test(expiration))
    throw new Error('withSecureNetwork: `expiration` debe ser AAAA-MM-DD.');
}

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function releaseXml({ domains, pins, expiration }) {
  const pinSet = [
    `      <pin-set${expiration ? ` expiration="${expiration}"` : ''}>`,
    ...pins.map((p) => `        <pin digest="SHA-256">${p}</pin>`),
    '      </pin-set>',
  ].join('\n');
  const domainConfigs = domains
    .map(
      (d) => `  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">${xmlEscape(d)}</domain>
${pinSet}
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </domain-config>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por plugins/withSecureNetwork.js. No editar a mano. -->
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
${domainConfigs}
</network-security-config>
`;
}

// Solo para builds debug: Metro sirve el bundle por http en la LAN.
const DEBUG_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por plugins/withSecureNetwork.js. Solo builds debug. -->
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const withSecureNetwork = (config, props) => {
  validate(props);

  config = withAndroidManifest(config, (c) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(c.modResults);
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    app.$['android:usesCleartextTraffic'] = 'false';
    return c;
  });

  config = withDangerousMod(config, [
    'android',
    (c) => {
      const appDir = path.join(c.modRequest.platformProjectRoot, 'app', 'src');
      write(path.join(appDir, 'main', 'res', 'xml', 'network_security_config.xml'), releaseXml(props));
      write(path.join(appDir, 'debug', 'res', 'xml', 'network_security_config.xml'), DEBUG_XML);
      return c;
    },
  ]);

  config = withInfoPlist(config, (c) => {
    const ats = (c.modResults.NSAppTransportSecurity = c.modResults.NSAppTransportSecurity ?? {});
    ats.NSAllowsArbitraryLoads = false;
    ats.NSPinnedDomains = ats.NSPinnedDomains ?? {};
    for (const d of props.domains) {
      ats.NSPinnedDomains[d] = {
        NSIncludesSubdomains: false,
        NSPinnedCAIdentities: props.pins.map((p) => ({ 'SPKI-SHA256-BASE64': p })),
      };
    }
    return c;
  });

  return config;
};

module.exports = withSecureNetwork;
module.exports.releaseXml = releaseXml;
module.exports.validate = validate;
