<?php
/**
 * Sample configuration for Sparxstar Twi TTS pronunciation endpoint.
 *
 * Copy the constants below into wp-config.php (or a must-use plugin loaded
 * before the pronunciation endpoint) and adjust paths for your host.
 *
 * Model assets — download from the Kasanoma project v1 release:
 *   https://github.com/michsethowusu/kasanoma/releases/tag/v1
 *
 * Files to download:
 *   kasanoma-twi.onnx        (the voice model)
 *   kasanoma-twi.onnx.json   (the model config — MUST sit beside the .onnx)
 *
 * Both files must be stored in the same directory. The paths below must
 * be absolute and readable by the web-server user (e.g. www-data).
 */

// ─── Required ────────────────────────────────────────────────────────────────

/** Absolute path to the Kasanoma Twi .onnx voice model. */
define( 'SPARXSTAR_TWI_MODEL', '/var/www/models/twi/kasanoma-twi.onnx' );

/** Absolute path to the matching .onnx.json model config. */
define( 'SPARXSTAR_TWI_MODEL_JSON', '/var/www/models/twi/kasanoma-twi.onnx.json' );

// ─── Piper runtime — choose ONE of the two options below ─────────────────────

/**
 * Option A (default): pip-installed piper-tts
 *
 * Install: pip install piper-tts
 * Confirm: python3 -m piper --version
 */
define( 'SPARXSTAR_PIPER_RUNTIME', 'python' );
define( 'SPARXSTAR_PYTHON_BIN', '/usr/bin/python3' );

/**
 * Option B: standalone Piper Linux binary (no Python required)
 *
 * Download the amd64 release from:
 *   https://github.com/rhasspy/piper/releases
 * Extract and place the `piper` binary at an absolute path.
 * Make it executable: chmod +x /usr/local/bin/piper
 *
 * If using this option, comment out Option A above and uncomment below:
 */
// define( 'SPARXSTAR_PIPER_RUNTIME', 'binary' );
// define( 'SPARXSTAR_PIPER_BINARY', '/usr/local/bin/piper' );

// ─── Optional ────────────────────────────────────────────────────────────────

/**
 * Cache TTL in seconds (default: 30 days).
 *
 * Cached WAV data is stored via WordPress transients, which transparently
 * use Redis / Memcached / APCu / database — whatever object cache drop-in
 * is active on this host. Each unique headword is synthesised at most once
 * within this window.
 */
define( 'SPARXSTAR_PRONOUNCE_CACHE_TTL', 2592000 );
