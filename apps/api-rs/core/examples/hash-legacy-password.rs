mod support;
use gil_core::api::password::hash_legacy_password;

fn main() {
    println!("{}", hash_legacy_password(&support::password(), &support::SystemPorts));
}
