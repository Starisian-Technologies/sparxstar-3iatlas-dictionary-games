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
					'validate_callback' => function( $value, $request, $param ) {
						// Validate raw value before sanitization
						if ( ! is_string( $value ) ) {
							return new WP_Error( 'invalid_type', 'word must be a string.', [ 'status' => 400 ] );
						}
						$trimmed = trim( $value );
						if ( $trimmed === '' ) {
							return new WP_Error( 'empty_word', 'word must not be empty.', [ 'status' => 400 ] );
						}
						$char_len = function_exists( 'mb_strlen' ) ? mb_strlen( $trimmed, 'UTF-8' ) : strlen( $trimmed );
						if ( $char_len > 256 ) {
							return new WP_Error( 'word_too_long', 'word exceeds 256 characters.', [ 'status' => 400 ] );
						}
						return true;
					},
					'sanitize_callback' => function( $raw ) {
						// Trim whitespace only — preserve diacritics, Twi
						// characters, and all valid UTF-8 graphemes exactly.
						return trim( $raw );
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
 * Fails closed when the auth helper is absent — never grants open access
 * to the synthesis endpoint if the parent plugin is not loaded.
 */
function sparxstar_pronounce_permissions( WP_REST_Request $request ) {
	if ( function_exists( 'sparxstar_verify_webster_auth' ) ) {
		return sparxstar_verify_webster_auth( $request );
	}
	return current_user_can( 'manage_options' ); // Prevent unauthenticated DoS on CPU-heavy TTS
}

/**
 * Validate that a path constant is a plain path with no null bytes.
 * The path is passed as a proc_open array argument so it is never
 * shell-interpolated, but we validate defensively anyway.
 *
 * @param string $path  Value of a define()'d path constant.
 * @return bool
 */
function sparxstar_validate_path( string $path ): bool {
	if ( $path === '' ) {
		return false;
	}
	if ( strpos( $path, "\0" ) !== false ) {
		return false;
	}
	return true;
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

	if ( ! sparxstar_validate_path( $model_path ) ) {
		return new WP_Error(
			'model_not_configured',
			'Twi TTS model path is not configured or contains invalid characters.',
			[ 'status' => 503 ]
		);
	}
	if ( ! file_exists( $model_path ) || ! is_readable( $model_path ) ) {
		return new WP_Error(
			'model_not_found',
			'Twi TTS model file does not exist or is not readable.',
			[ 'status' => 503 ]
		);
	}

	if ( ! sparxstar_validate_path( $model_json ) ) {
		return new WP_Error(
			'model_json_not_configured',
			'Twi TTS model config path is not configured or contains invalid characters.',
			[ 'status' => 503 ]
		);
	}
	if ( ! file_exists( $model_json ) || ! is_readable( $model_json ) ) {
		return new WP_Error(
			'model_json_not_found',
			'Twi TTS model config (.onnx.json) does not exist or is not readable.',
			[ 'status' => 503 ]
		);
	}

	// Deterministic cache key: SHA-256 of the exact UTF-8 headword string,
	// prefixed to avoid collision with other transient namespaces.
	$cache_key = 'sparxstar_twi_' . hash( 'sha256', $word );

	$ttl = defined( 'SPARXSTAR_PRONOUNCE_CACHE_TTL' ) ? (int) SPARXSTAR_PRONOUNCE_CACHE_TTL : 2592000;

	// WordPress transients transparently use Redis / Memcached / APCu /
	// database — whatever object cache drop-in is active on the host.
	// Binary WAV is stored base64-encoded to survive UTF-8 transient backends.
	$cached = get_transient( $cache_key );
	if ( $cached !== false ) {
		$wav = base64_decode( $cached, true );
		if ( $wav !== false ) {
			return sparxstar_wav_response( $wav, $ttl );
		}
		// Corrupt cache entry — delete and re-synthesise.
		delete_transient( $cache_key );
	}

	// Not cached — synthesise now.
	$wav = sparxstar_synthesise_twi( $word, $model_path, $model_json );
	if ( is_wp_error( $wav ) ) {
		return $wav;
	}

	set_transient( $cache_key, base64_encode( $wav ), $ttl );

	return sparxstar_wav_response( $wav, $ttl );
}

/**
 * Run Piper TTS and return the WAV bytes, or a WP_Error on failure.
 *
 * The headword is written to stdin of the Piper process so that it is
 * never interpolated into the shell command string — no injection risk.
 *
 * @param string $word        UTF-8 headword text.
 * @param string $model_path  Absolute path to .onnx model file.
 * @param string $model_json  Absolute path to .onnx.json config file.
 * @return string|WP_Error    WAV bytes on success.
 */
function sparxstar_synthesise_twi( string $word, string $model_path, string $model_json ) {
	$runtime = defined( 'SPARXSTAR_PIPER_RUNTIME' ) ? SPARXSTAR_PIPER_RUNTIME : 'python';

	if ( $runtime === 'binary' ) {
		$piper_bin = defined( 'SPARXSTAR_PIPER_BINARY' ) ? SPARXSTAR_PIPER_BINARY : 'piper';

		// If it looks like an absolute path, validate and check readable.
		if ( strpos( $piper_bin, '/' ) !== false ) {
			if ( ! sparxstar_validate_path( $piper_bin ) ) {
				return new WP_Error(
					'piper_binary_invalid',
					'SPARXSTAR_PIPER_BINARY contains invalid characters.',
					[ 'status' => 503 ]
				);
			}
			if ( ! file_exists( $piper_bin ) || ! is_readable( $piper_bin ) ) {
				return new WP_Error(
					'piper_binary_not_found',
					sprintf( 'Piper binary not found or not readable at "%s".', $piper_bin ),
					[ 'status' => 503 ]
				);
			}
		} elseif ( ! sparxstar_command_exists( $piper_bin ) ) {
			return new WP_Error(
				'piper_binary_not_found',
				sprintf( 'Piper binary "%s" not found on PATH.', $piper_bin ),
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

		// If it looks like an absolute path, validate and check readable.
		if ( strpos( $python_bin, '/' ) !== false ) {
			if ( ! sparxstar_validate_path( $python_bin ) ) {
				return new WP_Error(
					'python_binary_invalid',
					'SPARXSTAR_PYTHON_BIN contains invalid characters.',
					[ 'status' => 503 ]
				);
			}
			if ( ! file_exists( $python_bin ) || ! is_readable( $python_bin ) ) {
				return new WP_Error(
					'python_binary_not_found',
					sprintf( 'Python binary not found or not readable at "%s".', $python_bin ),
					[ 'status' => 503 ]
				);
			}
		} elseif ( ! sparxstar_command_exists( $python_bin ) ) {
			return new WP_Error(
				'python_binary_not_found',
				sprintf( 'Python binary "%s" not found on PATH.', $python_bin ),
				[ 'status' => 503 ]
			);
		}

		$cmd = [
			$python_bin, '-m', 'piper',
			'--model', $model_path,
			'--config', $model_json,
			'--output-raw',
		];
		error_log( sprintf( 'sparxstar_pronounce: synthesising via python "%s -m piper"', $python_bin ) );
	}

	$descriptors = [
		0 => [ 'pipe', 'r' ],
		1 => [ 'pipe', 'w' ],
		2 => [ 'pipe', 'w' ],
	];

	// proc_open accepts an array command on PHP ≥ 7.4, which skips shell
	// interpolation entirely — model path and word are never shell-expanded.
	$proc = proc_open( $cmd, $descriptors, $pipes );
	if ( ! is_resource( $proc ) ) {
		return new WP_Error( 'piper_failed', 'Failed to start Piper TTS process.', [ 'status' => 500 ] );
	}

	// Write the headword as UTF-8 to stdin and close the pipe so Piper
	// sees EOF and begins synthesis. No shell involvement — safe.
	$written = fwrite( $pipes[0], $word );
	fclose( $pipes[0] );

	if ( $written === false ) {
		fclose( $pipes[1] );
		fclose( $pipes[2] );
		proc_close( $proc );
		return new WP_Error( 'piper_stdin_failed', 'Failed to write headword to Piper stdin.', [ 'status' => 500 ] );
	}

	$raw_audio = stream_get_contents( $pipes[1] );
	$stderr    = stream_get_contents( $pipes[2] );
	fclose( $pipes[1] );
	fclose( $pipes[2] );

	$exit_code = proc_close( $proc );

	if ( $raw_audio === false || $stderr === false ) {
		error_log( 'sparxstar_pronounce: Failed to read Piper output streams.' );
		return new WP_Error( 'piper_output_failed', 'Failed to read Piper process output.', [ 'status' => 500 ] );
	}

	if ( $exit_code !== 0 || $raw_audio === '' ) {
		error_log( sprintf(
			'sparxstar_pronounce: Piper exited %d. stderr: %s',
			$exit_code,
			substr( (string) $stderr, 0, 512 )
		) );
		return new WP_Error(
			'piper_synthesis_failed',
			'TTS synthesis failed. Check server logs for details.',
			[ 'status' => 500 ]
		);
	}

	return sparxstar_pcm_to_wav( $raw_audio );
}

/**
 * Wrap a raw PCM byte string in a RIFF/WAV container.
 *
 * Piper's --output-raw flag produces 16-bit signed little-endian mono
 * PCM at the model's native sample rate (22050 Hz for Kasanoma Twi).
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
 * Return a WP_REST_Response that streams WAV bytes with the correct
 * Content-Type so browsers receive a playable audio file.
 *
 * The filter self-removes after firing and only intercepts the specific
 * response instance it was created for — safe in long-lived PHP processes.
 *
 * @param string $wav  Complete WAV file bytes.
 * @param int    $ttl  Cache TTL in seconds (used for Cache-Control max-age).
 * @return WP_REST_Response
 */
function sparxstar_wav_response( string $wav, int $ttl = 2592000 ): WP_REST_Response {
	$response = new WP_REST_Response( null, 200 );

	$filter = null;
	$filter = function( $served, $result ) use ( $wav, $ttl, $response, &$filter ) {
		// Only intercept the specific response this closure was created for.
		if ( $result !== $response ) {
			return $served;
		}
		// Self-remove before emitting output to prevent accumulation.
		remove_filter( 'rest_pre_serve_request', $filter, 10 );

		if ( $served ) {
			return $served;
		}
		header( 'Content-Type: audio/wav' );
		header( 'Content-Length: ' . strlen( $wav ) );
		header( 'Cache-Control: public, max-age=' . $ttl . ', immutable' );
		header( 'X-Content-Type-Options: nosniff' );
		echo $wav; // phpcs:ignore WordPress.Security.EscapeOutput
		return true;
	};

	add_filter( 'rest_pre_serve_request', $filter, 10, 2 );

	return $response;
}

/**
 * Check whether a command name resolves on the system PATH.
 *
 * Uses proc_open (without a shell) as primary check, then falls back to
 * scanning the PATH environment variable directly. No shell is invoked at
 * any point, so this works regardless of the host's PHP security
 * configuration (e.g. shell_exec or system in disable_functions).
 *
 * @param string $command  Command name (not an absolute path).
 * @return bool
 */
function sparxstar_command_exists( string $command ): bool {
	// Primary: run `which` via proc_open — no shell involved.
	$descriptors = [
		0 => [ 'pipe', 'r' ],
		1 => [ 'pipe', 'w' ],
		2 => [ 'pipe', 'w' ],
	];

	$proc = @proc_open( [ 'which', $command ], $descriptors, $pipes );
	if ( is_resource( $proc ) ) {
		fclose( $pipes[0] );
		$output = stream_get_contents( $pipes[1] );
		fclose( $pipes[1] );
		fclose( $pipes[2] );
		$exit = proc_close( $proc );

		if ( $exit === 0 && trim( (string) $output ) !== '' ) {
			return true;
		}
	}

	// Fallback: search the PATH environment variable directly — no shell.
	$path_env = getenv( 'PATH' );
	if ( $path_env ) {
		foreach ( explode( PATH_SEPARATOR, $path_env ) as $dir ) {
			$file = rtrim( $dir, DIRECTORY_SEPARATOR ) . DIRECTORY_SEPARATOR . $command;
			if ( @is_executable( $file ) ) {
				return true;
			}
		}
	}

	return false;
}
