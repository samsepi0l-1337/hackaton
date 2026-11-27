//! TS 원본: apps/api/src/password.ts
use crate::{ports::Ports, shared::account::BCRYPT_COST};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::sync::atomic::{AtomicBool, Ordering};

const ITER: u32 = 100_000;
/// TS: `export const INSECURE_DEV_PEPPER: string`.
pub const INSECURE_DEV_PEPPER: &str = "INSECURE-DEV-PEPPER-DO-NOT-USE-IN-PRODUCTION";
static WARNED: AtomicBool = AtomicBool::new(false);

fn derive(password: &str, salt: &[u8], iterations: u32) -> String {
    let mut out = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut out);
    hex::encode(out)
}
/// TS: `export async function hashLegacyPassword(password: string): Promise<string>`.
pub fn hash_legacy_password(password: &str, ports: &dyn Ports) -> String {
    let salt = ports.random_bytes(16);
    format!(
        "pbkdf2${ITER}${}${}",
        hex::encode(&salt),
        derive(password, &salt, ITER)
    )
}
/// TS: `export async function verifyLegacyPassword(password: string, stored: string): Promise<boolean>`.
pub fn verify_legacy_password(password: &str, stored: &str) -> bool {
    let mut parts = stored.split('$');
    let (Some("pbkdf2"), Some(iter), Some(salt), Some(hash)) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    let Ok(iter) = iter.parse::<u32>() else {
        return false;
    };
    if iter == 0 || salt.is_empty() || hash.is_empty() {
        return false;
    }
    // JS fromHex consumes pairs and parseInt accepts a hexadecimal prefix.
    let salt: Vec<u8> = salt
        .as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|p| {
            let digits: String = p
                .iter()
                .map(|b| char::from(*b))
                .take_while(|c| c.is_ascii_hexdigit())
                .collect();
            u8::from_str_radix(&digits, 16).unwrap_or(0)
        })
        .collect();
    let got = derive(password, &salt, iter);
    if got.len() != hash.len() {
        return false;
    }
    got.bytes()
        .zip(hash.bytes())
        .fold(0u8, |diff, (a, b)| diff | (a ^ b))
        == 0
}
/// TS: `export function randomToken(): string`.
pub fn random_token(ports: &dyn Ports) -> String {
    hex::encode(ports.random_bytes(32))
}

fn pepper_input(password: &str, pepper: &str) -> String {
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(pepper.as_bytes()) else {
        return String::new();
    };
    mac.update(password.as_bytes());
    STANDARD.encode(mac.finalize().into_bytes())
}
/// TS: `export interface Passwords`.
pub struct Passwords<'a> {
    pepper: String,
    ports: &'a dyn Ports,
}
impl Passwords<'_> {
    /// TS: `hash(password: string): Promise<string>`.
    pub fn hash(&self, password: &str) -> Result<String, String> {
        let salt: [u8; 16] = self
            .ports
            .random_bytes(16)
            .try_into()
            .map_err(|_| "invalid random salt length".to_string())?;
        bcrypt::hash_with_salt(pepper_input(password, &self.pepper), BCRYPT_COST, salt)
            .map(|h| format!("bcrypt${}", h.format_for_version(bcrypt::Version::TwoB)))
            .map_err(|e| e.to_string())
    }
    /// TS: `verify(password: string, stored: string): Promise<boolean>`.
    pub fn verify(&self, password: &str, stored: &str) -> bool {
        if let Some(hash) = stored.strip_prefix("bcrypt$") {
            bcrypt::verify(pepper_input(password, &self.pepper), hash).unwrap_or(false)
        } else {
            verify_legacy_password(password, stored)
        }
    }
    /// TS: `needsRehash(stored: string): boolean`.
    pub fn needs_rehash(&self, stored: &str) -> bool {
        !stored.starts_with("bcrypt$")
    }
}
/// TS: `export function createPasswords(pepper?: string): Passwords`.
pub fn create_passwords<'a>(pepper: Option<&str>, ports: &'a dyn Ports) -> Passwords<'a> {
    let pepper = pepper.filter(|p| !p.is_empty()).unwrap_or_else(|| {
        if !WARNED.swap(true, Ordering::Relaxed) { ports.log("warn", "[password] PASSWORD_PEPPER 가 없어 개발용 pepper 를 씁니다. 운영에서는 secret 을 설정하세요"); }
        INSECURE_DEV_PEPPER
    });
    Passwords {
        pepper: pepper.to_string(),
        ports,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ports::{HttpReq, HttpResp, Mail};
    use async_trait::async_trait;
    use serde_json::Value;

    struct TestPorts;
    #[async_trait(?Send)]
    impl Ports for TestPorts {
        async fn sleep(&self, _ms: u64) {}
        async fn fetch(&self, _: HttpReq) -> Result<HttpResp, String> {
            Err("unused".into())
        }
        async fn doc_worker(&self, _: &str, _: &Value) -> Option<Result<HttpResp, String>> {
            None
        }
        async fn ai_run(&self, _: &str, _: &Value, _: &Value) -> Option<Result<Value, String>> {
            None
        }
        async fn send_email(&self, _: &str, _: &Mail) -> Option<Result<(), String>> {
            None
        }
        fn random_bytes(&self, n: usize) -> Vec<u8> {
            vec![42; n]
        }
        fn log(&self, _: &str, _: &str) {}
    }

    #[test]
    fn legacy_round_trip() {
        let stored = hash_legacy_password("demo1234!", &TestPorts);
        assert_eq!(stored.split('$').count(), 4);
        assert!(verify_legacy_password("demo1234!", &stored));
        assert!(!verify_legacy_password("wrong", &stored));
    }

    #[test]
    fn ts_hashes_verify() {
        let bcrypt_hash = "bcrypt$$2b$10$n1.adS/qRPnMmRVkHP.53uuNZIfwK8Gc.KH8gjO9qIpB3vky9gh52";
        assert!(
            bcrypt::verify(pepper_input("Pass-한글-1!", "pep-1"), &bcrypt_hash[7..])
                .unwrap_or(false)
        );
        assert!(
            !bcrypt::verify(pepper_input("wrong", "pep-1"), &bcrypt_hash[7..]).unwrap_or(false)
        );
        let legacy = "pbkdf2$100000$dca49dc73f1e9b582d11ce05a65d3cb1$52c094768fbab44cdf0dd7e006d044456b4c2c1862cb4cd0ea10c52d69c13e81";
        assert!(verify_legacy_password("demo1234!", legacy));
        assert!(!verify_legacy_password("wrong", legacy));
    }
}
