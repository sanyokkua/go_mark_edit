package kv

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
)

// EncodeVersionedJSON adds a numeric version member to an object payload. The
// resulting object stays flat so its persisted shape is {"version":N,…}.
func EncodeVersionedJSON(version int, payload any) (string, error) {
	if version < 1 {
		return "", errors.New("versioned JSON version must be positive")
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("encode versioned JSON payload: %w", err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &fields); err != nil || fields == nil {
		if err == nil {
			err = errors.New("payload must be a JSON object")
		}
		return "", fmt.Errorf("encode versioned JSON object: %w", err)
	}
	fields["version"] = json.RawMessage(strconv.Itoa(version))
	encoded, err = json.Marshal(fields)
	if err != nil {
		return "", fmt.Errorf("encode versioned JSON object: %w", err)
	}
	return string(encoded), nil
}

// DecodeVersionedJSON decodes the expected version into destination. A valid
// object with a different version is absent without error; malformed JSON and
// a malformed version member remain decode failures for the owner to classify.
func DecodeVersionedJSON(encoded string, expectedVersion int, destination any) (bool, error) {
	if expectedVersion < 1 {
		return false, errors.New("expected JSON version must be positive")
	}
	var fields map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader([]byte(encoded)))
	if err := decoder.Decode(&fields); err != nil {
		return false, fmt.Errorf("decode versioned JSON object: %w", err)
	}
	if err := requireDecoderEOF(decoder); err != nil {
		return false, err
	}
	if fields == nil {
		return false, errors.New("decode versioned JSON object: expected an object")
	}
	versionValue, ok := fields["version"]
	if !ok {
		return false, errors.New("decode versioned JSON object: version is required")
	}
	var version int
	if err := json.Unmarshal(versionValue, &version); err != nil {
		return false, fmt.Errorf("decode versioned JSON version: %w", err)
	}
	if version != expectedVersion {
		return false, nil
	}
	if destination == nil {
		return false, errors.New("decode versioned JSON destination is required")
	}
	decoder = json.NewDecoder(bytes.NewReader([]byte(encoded)))
	decoder.UseNumber()
	if err := decoder.Decode(destination); err != nil {
		return false, fmt.Errorf("decode versioned JSON payload: %w", err)
	}
	if err := requireDecoderEOF(decoder); err != nil {
		return false, err
	}
	return true, nil
}

func requireDecoderEOF(decoder *json.Decoder) error {
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err == io.EOF {
		return nil
	} else if err != nil {
		return fmt.Errorf("decode versioned JSON trailing value: %w", err)
	}
	return errors.New("decode versioned JSON trailing value: multiple JSON values")
}
