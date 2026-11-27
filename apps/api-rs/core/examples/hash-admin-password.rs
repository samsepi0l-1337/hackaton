mod support;
use gil_core::api::password::create_passwords;

fn main() {
    let pepper = std::env::var("PASSWORD_PEPPER").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| {
        eprintln!("PASSWORD_PEPPER 환경 변수가 필요해요 (배포한 secret 과 같은 값).");
        std::process::exit(1);
    });
    let password = support::password();
    let ports = support::SystemPorts;
    let hash = create_passwords(Some(&pepper), &ports).hash(&password).expect("failed to hash password");
    println!("{hash}");
}
