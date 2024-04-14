export const deepCompare = (obj1, obj2) => {
  if (obj1 === obj2) return true;

  if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
    return false;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (let key of keys1) {
    if (!keys2.includes(key)) return false;

    if (typeof obj1[key] === 'function' || typeof obj2[key] === 'function') {
      if (obj1[key].toString() !== obj2[key].toString()) return false;
    } else {
      if (!deepCompare(obj1[key], obj2[key])) return false;
    }
  }

  return true;
}

export const deepCopy = (obj) => {
  if (typeof obj !== 'object' || obj === null) {
    return obj; // Return the value if obj is not an object
  }

  let copy;

  // Handle Array
  if (Array.isArray(obj)) {
    copy = [];
    obj.forEach(elem => {
      copy.push(deepCopy(elem));
    });
    return copy;
  }

  // Handle Object
  if (typeof obj === 'object') {
    copy = {};
    Object.keys(obj).forEach(key => {
      copy[key] = deepCopy(obj[key]);
    });
    return copy;
  }
}