from hashlib import sha256
k = open("/home/mobsf/.MobSF/secret", "rb").read().strip()
print(sha256(k).hexdigest())
