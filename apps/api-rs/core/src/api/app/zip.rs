//! Minimal ZIP writer for uncompressed document packages.

pub fn crc32(data: &[u8]) -> u32 {
    let mut table = [0u32; 256];
    for (i, slot) in table.iter_mut().enumerate() {
        let mut crc = i as u32;
        for _ in 0..8 {
            crc = if crc & 1 != 0 { (crc >> 1) ^ 0xedb8_8320 } else { crc >> 1 };
        }
        *slot = crc;
    }
    let mut crc = !0u32;
    for &byte in data {
        crc = (crc >> 8) ^ table[((crc ^ u32::from(byte)) & 255) as usize];
    }
    !crc
}

fn u16le(out: &mut Vec<u8>, n: u16) { out.extend_from_slice(&n.to_le_bytes()); }
fn u32le(out: &mut Vec<u8>, n: u32) { out.extend_from_slice(&n.to_le_bytes()); }

pub fn stored_zip(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for &(name, data) in entries {
        let offset = out.len() as u32;
        let name = name.as_bytes();
        let size = data.len() as u32;
        let crc = crc32(data);
        u32le(&mut out, 0x04034b50); u16le(&mut out, 20); u16le(&mut out, 0x800);
        u16le(&mut out, 0); u16le(&mut out, 0); u16le(&mut out, 0x21);
        u32le(&mut out, crc); u32le(&mut out, size); u32le(&mut out, size);
        u16le(&mut out, name.len() as u16); u16le(&mut out, 0);
        out.extend_from_slice(name); out.extend_from_slice(data);
        u32le(&mut central, 0x02014b50); u16le(&mut central, 20); u16le(&mut central, 20);
        u16le(&mut central, 0x800); u16le(&mut central, 0); u16le(&mut central, 0); u16le(&mut central, 0x21);
        u32le(&mut central, crc); u32le(&mut central, size); u32le(&mut central, size);
        u16le(&mut central, name.len() as u16); u16le(&mut central, 0); u16le(&mut central, 0);
        u16le(&mut central, 0); u16le(&mut central, 0); u32le(&mut central, 0); u32le(&mut central, offset);
        central.extend_from_slice(name);
    }
    let offset = out.len() as u32;
    out.extend_from_slice(&central);
    u32le(&mut out, 0x06054b50); u16le(&mut out, 0); u16le(&mut out, 0);
    u16le(&mut out, entries.len() as u16); u16le(&mut out, entries.len() as u16);
    u32le(&mut out, central.len() as u32); u32le(&mut out, offset); u16le(&mut out, 0);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn crc_and_local_entries() {
        assert_eq!(crc32(b"123456789"), 0xcbf43926);
        let bytes = stored_zip(&[("mimetype", b"abc"), ("other", b"123")]);
        let mut pos = 0;
        for (name, data) in [("mimetype", &b"abc"[..]), ("other", &b"123"[..])] {
            assert_eq!(&bytes[pos..pos+4], b"PK\x03\x04");
            assert_eq!(u16::from_le_bytes(bytes[pos+8..pos+10].try_into().unwrap()), 0);
            let size = u32::from_le_bytes(bytes[pos+18..pos+22].try_into().unwrap()) as usize;
            let name_len = u16::from_le_bytes(bytes[pos+26..pos+28].try_into().unwrap()) as usize;
            let extra_len = u16::from_le_bytes(bytes[pos+28..pos+30].try_into().unwrap()) as usize;
            assert_eq!(&bytes[pos+30..pos+30+name_len], name.as_bytes());
            let start = pos+30+name_len+extra_len;
            assert_eq!(&bytes[start..start+size], data);
            pos = start+size;
        }
        assert_eq!(&bytes[pos..pos+4], b"PK\x01\x02");
    }
}
