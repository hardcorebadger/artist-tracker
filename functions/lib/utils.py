
def get_user(uid, db):
    ref = db.collection("users").document(uid)
    doc = ref.get()
    data = doc.to_dict()
    return data