//#region src/binary-data.ts
function containsBinaryData(data) {
	if (data === null || data === void 0) return false;
	if (data instanceof ArrayBuffer || data instanceof Blob || data instanceof File) return true;
	if (data && data.buffer instanceof ArrayBuffer && data.byteLength !== void 0) return true;
	if (Array.isArray(data)) return data.some((item) => containsBinaryData(item));
	if (typeof data === "object") return Object.values(data).some((value) => containsBinaryData(value));
	return false;
}
function processBinaryData(data, onBinaryData) {
	if (data === null || data === void 0) return data;
	if (data instanceof ArrayBuffer) {
		const fieldName = onBinaryData(new Blob([data]));
		return {
			__binary_ref: fieldName,
			type: "ArrayBuffer"
		};
	}
	if (data && data.buffer instanceof ArrayBuffer && data.byteLength !== void 0) {
		const fieldName = onBinaryData(new Blob([data.buffer]));
		return {
			__binary_ref: fieldName,
			type: data.constructor.name,
			byteLength: data.byteLength
		};
	}
	if (data instanceof Blob) {
		const fieldName = onBinaryData(data);
		return {
			__binary_ref: fieldName,
			type: "Blob"
		};
	}
	if (data instanceof File) {
		const fieldName = onBinaryData(data);
		return {
			__binary_ref: fieldName,
			type: "File",
			name: data.name
		};
	}
	if (Array.isArray(data)) return data.map((item) => processBinaryData(item, onBinaryData));
	if (typeof data === "object") {
		const processed = {};
		for (const [key, value] of Object.entries(data)) processed[key] = processBinaryData(value, onBinaryData);
		return processed;
	}
	return data;
}
function processBinaryDataForResponse(data, onBinaryData) {
	if (data === null || data === void 0) return data;
	if (data instanceof ArrayBuffer) {
		const fieldName = onBinaryData(new Blob([data]));
		return {
			__binary_ref: fieldName,
			type: "ArrayBuffer"
		};
	}
	if (data && data.buffer instanceof ArrayBuffer && data.byteLength !== void 0) {
		const fieldName = onBinaryData(new Blob([data.buffer]));
		return {
			__binary_ref: fieldName,
			type: data.constructor.name,
			byteLength: data.byteLength
		};
	}
	if (data instanceof Blob) {
		const fieldName = onBinaryData(data);
		return {
			__binary_ref: fieldName,
			type: "Blob"
		};
	}
	if (data instanceof File) {
		const fieldName = onBinaryData(data);
		return {
			__binary_ref: fieldName,
			type: "File",
			name: data.name
		};
	}
	if (Array.isArray(data)) return data.map((item) => processBinaryDataForResponse(item, onBinaryData));
	if (typeof data === "object") {
		const processed = {};
		for (const [key, value] of Object.entries(data)) processed[key] = processBinaryDataForResponse(value, onBinaryData);
		return processed;
	}
	return data;
}
function restoreBinaryData(data, binaryDataMap) {
	if (data === null || data === void 0) return data;
	if (typeof data === "object" && data.__binary_ref) {
		const binaryData = binaryDataMap[data.__binary_ref];
		if (!binaryData) throw new Error(`Binary data reference not found: ${data.__binary_ref}`);
		if (data.type === "ArrayBuffer") return binaryData.data;
		if (data.type && data.type.includes("Array") && data.type !== "ArrayBuffer") {
			const arrayBuffer = binaryData.data;
			const byteLength = data.byteLength || arrayBuffer.byteLength;
			switch (data.type) {
				case "Uint8Array": return new Uint8Array(arrayBuffer, 0, byteLength);
				case "Uint8ClampedArray": return new Uint8ClampedArray(arrayBuffer, 0, byteLength);
				case "Uint16Array": return new Uint16Array(arrayBuffer, 0, byteLength / 2);
				case "Uint32Array": return new Uint32Array(arrayBuffer, 0, byteLength / 4);
				case "Int8Array": return new Int8Array(arrayBuffer, 0, byteLength);
				case "Int16Array": return new Int16Array(arrayBuffer, 0, byteLength / 2);
				case "Int32Array": return new Int32Array(arrayBuffer, 0, byteLength / 4);
				case "Float32Array": return new Float32Array(arrayBuffer, 0, byteLength / 4);
				case "Float64Array": return new Float64Array(arrayBuffer, 0, byteLength / 8);
				default: return new Uint8Array(arrayBuffer, 0, byteLength);
			}
		}
		if (data.type === "Blob") return new Blob([binaryData.data], { type: binaryData.type });
		if (data.type === "File") return new File([binaryData.data], data.name || binaryData.name, { type: binaryData.type });
		return binaryData;
	}
	if (Array.isArray(data)) return data.map((item) => restoreBinaryData(item, binaryDataMap));
	if (typeof data === "object") {
		const restored = {};
		for (const [key, value] of Object.entries(data)) restored[key] = restoreBinaryData(value, binaryDataMap);
		return restored;
	}
	return data;
}
async function parseMultipartFormData(req) {
	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("multipart/form-data")) throw new Error("Not a multipart/form-data request");
	const boundaryMatch = contentType.match(/boundary=([^;]+)/);
	if (!boundaryMatch) throw new Error("No boundary found in multipart/form-data header");
	const boundary = boundaryMatch[1].trim();
	const bodyBuffer = await req.arrayBuffer();
	const bodyBytes = new Uint8Array(bodyBuffer);
	const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
	const formData = {};
	let start = 0;
	let partIndex = 0;
	while (start < bodyBytes.length) {
		let boundaryStart = -1;
		for (let i = start; i <= bodyBytes.length - boundaryBytes.length; i++) {
			let match = true;
			for (let j = 0; j < boundaryBytes.length; j++) if (bodyBytes[i + j] !== boundaryBytes[j]) {
				match = false;
				break;
			}
			if (match) {
				boundaryStart = i;
				break;
			}
		}
		if (boundaryStart === -1) break;
		start = boundaryStart + boundaryBytes.length;
		if (start < bodyBytes.length && bodyBytes[start] === 13 && bodyBytes[start + 1] === 10) start += 2;
		let nextBoundaryStart = -1;
		for (let i = start; i <= bodyBytes.length - boundaryBytes.length; i++) {
			let match = true;
			for (let j = 0; j < boundaryBytes.length; j++) if (bodyBytes[i + j] !== boundaryBytes[j]) {
				match = false;
				break;
			}
			if (match) {
				nextBoundaryStart = i;
				break;
			}
		}
		if (nextBoundaryStart === -1) {
			const termBoundary = new TextEncoder().encode(`--${boundary}--`);
			for (let i = start; i <= bodyBytes.length - termBoundary.length; i++) {
				let match = true;
				for (let j = 0; j < termBoundary.length; j++) if (bodyBytes[i + j] !== termBoundary[j]) {
					match = false;
					break;
				}
				if (match) {
					nextBoundaryStart = i;
					break;
				}
			}
			if (nextBoundaryStart === -1) nextBoundaryStart = bodyBytes.length;
		}
		const partEnd = nextBoundaryStart;
		if (partEnd <= start) break;
		const partBytes = bodyBytes.slice(start, partEnd);
		let headerEnd = -1;
		for (let i = 0; i <= partBytes.length - 4; i++) if (partBytes[i] === 13 && partBytes[i + 1] === 10 && partBytes[i + 2] === 13 && partBytes[i + 3] === 10) {
			headerEnd = i;
			break;
		}
		if (headerEnd === -1) {
			start = partEnd;
			continue;
		}
		const headerBytes = partBytes.slice(0, headerEnd);
		const headerText = new TextDecoder().decode(headerBytes);
		const contentDisposition = headerText.match(/Content-Disposition: form-data; name="([^"]+)"/);
		if (!contentDisposition) {
			start = partEnd;
			continue;
		}
		const fieldName = contentDisposition[1];
		const contentStart = headerEnd + 4;
		let contentEnd = partBytes.length;
		if (contentEnd >= contentStart + 2 && partBytes[contentEnd - 2] === 13 && partBytes[contentEnd - 1] === 10) contentEnd -= 2;
		const contentBytes = partBytes.slice(contentStart, contentEnd);
		const filenameMatch = headerText.match(/filename="([^"]+)"/);
		if (filenameMatch) {
			const filename = filenameMatch[1];
			const contentTypeMatch = headerText.match(/Content-Type: ([^\r\n]+)/);
			const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : "application/octet-stream";
			const arrayBuffer = contentBytes.slice().buffer;
			formData[fieldName] = {
				name: filename,
				type: mimeType,
				data: arrayBuffer,
				size: contentBytes.length
			};
		} else formData[fieldName] = new TextDecoder().decode(contentBytes);
		start = partEnd;
		partIndex++;
	}
	return formData;
}

//#endregion
export { containsBinaryData, parseMultipartFormData, processBinaryData, processBinaryDataForResponse, restoreBinaryData };