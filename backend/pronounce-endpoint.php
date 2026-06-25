<?php
/**
 * Sparxstar Dictionary — Twi TTS Pronunciation Endpoint
 *
 * Registers GET /wp-json/sparxstar/v1/dictionary/pronounce?word=<headword>
 *
 * Returns audio/wav synthesised by the Kasanoma Twi Piper model.
 * Each unique headword is synthesised at most once; subsequent requests
 * are served from the WordPress object cache (backed by Redis / Memcached
 * / APCu / database transients — whatever the host has installed).
 *
 * Configuration — define in wp-config.php (or a must-use plugin):
 *
 *   // Required: path to the .onnx model file.
 *   define( 'SPARXSTAR_TWI_MODEL', '/var/www/models/twi/kasanoma-twi.onnx' );
 *
 *   // Required: path to the .onnx.json config that lives beside the model.
 *   define( 'SPARXSTAR_TWI_MODEL_JSON', '/var/www/models/twi/kasanoma-twi.onnx.json' );
 *
 *   // Choose which Piper runtime to use:
 *   //   'python' → `python3 -m piper` (pip-installed piper-tts)
 *   //   'binary' → standalone Piper Linux binary
 *   define( 'SPARXSTAR_PIPER_RUNTIME', 'python' ); // default: 'python'
 *
 *   // Only used when SPARXSTAR_PIPER_RUNTIME = 'binary'.
 *   // Path to the compiled Piper executable.
 *   define( 'SPARXSTAR_PIPER_BINARY', '/usr/local/bin/piper' );
 *
 *   // Optional: Python executable path. Defaults to 'python3'.
 *   define( 'SPARXSTAR_PYTHON_BIN', '/usr/bin/python3' );
 *
 *   // Optional: cache TTL in seconds. Defaults to 30 days (2,592,000 s).
 *   define( 'SPARXSTAR_PRONOUNCE_CACHE_TTL', 2592000 );
 *
 * Install:
 *   Drop this file into your WordPress plugin that registers the
 *   sparxstar/v1/dictionary REST namespace, or into a must-use plugin,
 *   and ensure it is require_once'd (or auto-loaded) on init.
 *
 * Runtime used: the value of SPARXSTAR_PIPER_RUNTIME is logged to
 * the PHP error log on first synthesis for each word so you can
 * confirm which binary path is active.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

add_action( 'rest_api_init', 'sparxstar_register_pronounce_route' );

function sparxstar_register_pronounce_route() {
	register_rest_route(
		'sparxstar/v1/dictionary',
		'/pronounce',
		[
			'methods'             => 'GET',
			'callback'            => 'sparxstar_pronounce_handler',
			'permission_callback' => 'sparxstar_pronounce_permissions',
			'args'                => [
				'word' => [
					'required'          => true,
					'type'              => 'string',
					'sanitize_callback' => function( $raw ) {
						// Trim whitespace only — preserve diacritics, Twi
						// characters, and all valid UTF-8 graphemes exactly.
						return trim( $raw );
					},
					'validate_callback' => function( $value ) {
						$v = trim( $value );
						if ( $v === '' ) {
							return new WP_Error( 'empty_word', 'word must not be empty.', [ 'status' => 400 ] );
						}
						if ( mb_strlen( $v, 'UTF-8' ) > 256 ) {
							return new WP_Error( 'word_too_long', 'word exceeds 256 characters.', [ 'status' => 400 ] );
						}
						return true;
					},
				],
			],
		]
	);
}

/**
 * Allow access if the request carries a valid page-token or API key.
 * Reuses the same Webster auth check as every other browse endpoint.
 *
 * Falls back to returning true if the parent plugin's auth helper isn't
 * available (e.g. this file is loaded standalone for testing).
 */
function sparxstar_pronounce_permissions( WP_REST_Request $request ) {
	if ( function_exists( 'sparxstar_verify_webster_auth' ) ) {
		return sparxstar_verify_webster_auth( $request );
	}
	return true; // degrade gracefully when helper is absent
}

/**
 * Main handler: check cache → synthesise → cache → stream.
 *
 * @param WP_REST_Request $request
 * @return WP_REST_Response|WP_Error
 */
function sparxstar_pronounce_handler( WP_REST_Request $request ) {
	$word = $request->get_param( 'word' );

	$model_path = defined( 'SPARXSTAR_TWI_MODEL' ) ? SPARXSTAR_TWI_MODEL : '';
	$model_json = defined( 'SPARXSTAR_TWI_MODEL_JSON' ) ? SPARXSTAR_TWI_MODEL_JSON : '';

	if ( $model_path === '' || ! file_exists( $model_path ) ) {
		return new WP_Error(
			'model_not_configured',
			'Twi TTS model path is not configured or the file does not exist.',
			[ 'status' => 503 ]
		);
	}
	if ( $model_json === '' || ! file_exists( $model_json ) ) {
		return new WP_Error(
			'model_json_not_configured',
			'Twi TTS model config (.onnx.json) is not configured or the file does not exist.',
			[ 'status' => 503 ]
		);
	}

	// Deterministic cache key: SHA-256 of the exact UTF-8 headword string,
	// prefixed to avoid collision with other transient namespaces.
	$cache_key = 'sparxstar_twi_' . hash( 'sha256', $word );

	// WordPress transients transparently use Redis / Memcached / APCu /
	// database — whatever object cache drop-in is active on the host.
	$cached_wav = get_transient( $cache_key );
	if ( $cached_wav !== false ) {
		return sparxstar_wav_response( $cached_wav );
	}

	// Not cached — synthesise now.
	$wav = sparxstar_synthesise_twi( $word, $model_path, $model_json );
	if ( is_wp_error( $wav ) ) {
		return $wav;
	}

	$ttl = defined( 'SPARXSTAR_PRONOUNCE_CACHE_TTL' ) ? (int) SPARXSTAR_PRONOUNCE_CACHE_TTL : 2592000;
	set_transient( $cache_key, $wav, $ttl );

	return sparxstar_wav_response( $wav );
}

/**
 * Run Piper TTS and return the raw WAV bytes, or a WP_Error on failure.
 *
 * The headword is written to stdin of the Piper process so that it is
 * never interpolated into the shell command string — no injection risk.
 *
 * @param string $word        UTF-8 headword text.
 * @param string $model_path  Absolute path to .onnx model file.
 * @param string $model_json  Absolute path to .onnx.json config file.
 * @return string|WP_Error    Raw WAV bytes on success.
 */
function sparxstar_synthesise_twi( string $word, string $model_path, string $model_json ) {
	$runtime = defined( 'SPARXSTAR_PIPER_RUNTIME' ) ? SPARXSTAR_PIPER_RUNTIME : 'python';

	if ( $runtime === 'binary' ) {
		$piper_bin = defined( 'SPARXSTAR_PIPER_BINARY' ) ? SPARXSTAR_PIPER_BINARY : 'piper';
		if ( ! file_exists( $piper_bin ) && ! sparxstar_command_exists( $piper_bin ) ) {
			return new WP_Error(
				'piper_binary_not_found',
				sprintf( 'Piper binary not found at "%s".', $piper_bin ),
				[ 'status' => 503 ]
			);
		}
		$cmd = [
			$piper_bin,
			'--model', $model_path,
			'--config', $model_json,
			'--output-raw',
		];
		error_log( sprintf( 'sparxstar_pronounce: synthesising via binary "%s"', $piper_bin ) );
	} else {
		// Default: pip-installed piper-tts (`python3 -m piper`)
		$python_bin = defined( 'SPARXSTAR_PYTHON_BIN' ) ? SPARXSTAR_PYTHON_BIN : 'python3';
		$cmd = [
			$python_bin, '-m', 'piper',
			'--model', $model_path,
			'--config', $model_json,
			'--output-raw',
		];
		error_log( sprintf( 'sparxstar_pronounce: synthesising via python "%s -m piper"', $python_bin ) );
	}

	// Build descriptor spec: stdin (pipe in), stdout (pipe out), stderr (pipe for capture).
	$descriptors = [
		0 => [ 'pipe', 'r' ],
		1 => [ 'pipe', 'w' ],
		2 => [ 'pipe', 'w' ],
	];

	// proc_open accepts an array command on PHP ≥ 7.4, which skips shell
	// interpolation entirely — no escaping required for model path or word.
	$proc = proc_open( $cmd, $descriptors, $pipes );
	if ( ! is_resource( $proc ) ) {
		return new WP_Error( 'piper_failed', 'Failed to start Piper TTS process.', [ 'status' => 500 ] );
	}

	// Write the headword as UTF-8 to stdin and close the pipe so Piper
	// sees EOF and begins synthesis. No shell involvement — safe.
	fwrite( $pipes[0], $word );
	fclose( $pipes[0] );

	$raw_audio = stream_get_contents( $pipes[1] );
	$stderr    = stream_get_contents( $pipes[2] );
	fclose( $pipes[1] );
	fclose( $pipes[2] );

	$exit_code = proc_close( $proc );

	if ( $exit_code !== 0 || $raw_audio === false || $raw_audio === '' ) {
		error_log( sprintf(
			'sparxstar_pronounce: Piper exited %d. stderr: %s',
			$exit_code,
			substr( $stderr, 0, 512 )
		) );
		return new WP_Error(
			'piper_synthesis_failed',
			'TTS synthesis failed. Check server logs for details.',
			[ 'status' => 500 ]
		);
	}

	// --output-raw produces a headerless PCM stream; wrap it in a minimal
	// WAV container so browsers can decode it with <Audio> or fetch().
	return sparxstar_pcm_to_wav( $raw_audio );
}

/**
 * Wrap a raw PCM byte string in a RIFF/WAV container.
 *
 * Piper's --output-raw flag produces 16-bit signed little-endian mono
 * PCM at the model's native sample rate (22050 Hz for Kasanoma Twi).
 * Browsers cannot play headerless PCM; this function prepends the
 * 44-byte RIFF/WAV header so the audio is self-describing.
 *
 * @param string $pcm  Raw PCM bytes from Piper.
 * @param int $rate    Sample rate in Hz (default 22050, Kasanoma Twi native).
 * @return string      Complete WAV file bytes.
 */
function sparxstar_pcm_to_wav( string $pcm, int $rate = 22050 ): string {
	$channels    = 1;
	$bit_depth   = 16;
	$byte_rate   = $rate * $channels * ( $bit_depth / 8 );
	$block_align = $channels * ( $bit_depth / 8 );
	$data_len    = strlen( $pcm );
	$chunk_size  = 36 + $data_len;

	$header = pack( 'A4VA4A4VvvVVvvA4V',
		'RIFF',        // ChunkID
		$chunk_size,   // ChunkSize
		'WAVE',        // Format
		'fmt ',        // Subchunk1ID
		16,            // Subchunk1Size (PCM)
		1,             // AudioFormat (PCM = 1)
		$channels,     // NumChannels
		$rate,         // SampleRate
		$byte_rate,    // ByteRate
		$block_align,  // BlockAlign
		$bit_depth,    // BitsPerSample
		'data',        // Subchunk2ID
		$data_len      // Subchunk2Size
	);

	return $header . $pcm;
}

/**
 * Return a raw WP_REST_Response that streams WAV bytes with the correct
 * Content-Type so browsers receive a playable audio file.
 *
 * WP_REST_Response does not natively support binary responses, so we
 * hook into `rest_pre_serve_request` to emit the bytes and headers
 * directly, then short-circuit normal JSON serialisation.
 *
 * @param string $wav  Complete WAV file bytes.
 * @return WP_REST_Response
 */
function sparxstar_wav_response( string $wav ): WP_REST_Response {
	// Capture $wav in the closure; hook fires once and then removes itself.
	add_filter(
		'rest_pre_serve_request',
		function( $served ) use ( $wav ) {
			if ( $served ) {
				return $served;
			}
			header( 'Content-Type: audio/wav' );
			header( 'Content-Length: ' . strlen( $wav ) );
			header( 'Cache-Control: public, max-age=2592000, immutable' );
			header( 'X-Content-Type-Options: nosniff' );
			echo $wav; // phpcs:ignore WordPress.Security.EscapeOutput
			return true;
		},
		10,
		1
	);

	return new WP_REST_Response( null, 200 );
}

/**
 * Check whether a command name resolves on the system PATH.
 *
 * @param string $command  Command name (not a path).
 * @return bool
 */
function sparxstar_command_exists( string $command ): bool {
	$output = shell_exec( 'command -v ' . escapeshellarg( $command ) . ' 2>/dev/null' );
	return ! empty( $output );
}
