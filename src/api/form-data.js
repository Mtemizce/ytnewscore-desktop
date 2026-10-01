// Görselli kayıtlar multipart gider: dosyalar, diziler (key[]) ve true/false → 1/0.

export function toFormData(payload, method = null) {
  const form = new FormData();
  if (method) {
    form.append('_method', method); // PHP multipart PUT gövdesini okumaz: POST + _method
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    if (Array.isArray(value) && !value.length) {
      form.append(key, ''); // boş liste: "hepsi kaldırıldı" anlamında, alan yine gider
    } else if (Array.isArray(value)) {
      value.forEach((item) => form.append(`${key}[]`, item instanceof File ? item : String(item)));
    } else if (value instanceof File) {
      form.append(key, value);
    } else if (typeof value === 'boolean') {
      form.append(key, value ? '1' : '0');
    } else {
      form.append(key, value === null ? '' : String(value));
    }
  });

  return form;
}
