# What production is serving right now. Terraform auto-loads *.auto.tfvars, and those win over
# terraform.tfvars, so this tracked value beats whatever stale tag a deploy machine still holds
# locally -- terraform.tfvars is gitignored and nobody can review it.
#
# Update this as the last step of a release, once traffic has been shifted. It is a record, not a
# control: run.tf ignores the image, so changing this does not deploy anything.
image_tag = "v086-pr29-pr30-17a6465"
